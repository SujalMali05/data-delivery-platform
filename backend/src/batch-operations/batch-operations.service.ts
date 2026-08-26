import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RcloneService } from '../rclone/rclone.service';
import { RcloneConfigService } from '../rclone/rclone-config.service';
import { StsService } from '../aws/sts.service';
import { TransfersService } from '../transfers/transfers.service';
import { TransferEventsService } from '../transfers/transfer-events.service';
import {
  RunBatchDeleteDto,
  AnalyzeBatchDeleteDto,
  RunBatchCopyDto,
  AnalyzeBatchCopyDto,
  AnalyzeBatchCopyAllObjectsDto,
  AnalyzeBatchCopySyncDto,
  RunBatchCopySyncDto,
} from './dto/batch-operations.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class BatchOperationsService {
  private readonly logger = new Logger('BatchOperationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rcloneService: RcloneService,
    private readonly rcloneConfig: RcloneConfigService,
    private readonly stsService: StsService,
    private readonly transfersService: TransfersService,
    private readonly transferEvents: TransferEventsService,
  ) {}

  /**
   * Parse CSV content into an array of file path strings
   */
  private parseCsvPaths(csvContent: string): string[] {
    if (!csvContent) return [];
    const lines = csvContent.split(/\r?\n/);
    const paths: string[] = [];

    let startIndex = 0;
    if (lines.length > 0) {
      const firstLine = lines[0].toLowerCase();
      if (firstLine.includes('path') || firstLine.includes('file')) {
        startIndex = 1;
      }
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cleaned = line.replace(/^["']|["']$/g, '').trim();
      if (cleaned) {
        paths.push(cleaned);
      }
    }
    return paths;
  }

  /**
   * Helper to configure a dynamic remote path structure for rclone commands
   */
  private async resolveRemoteFs(
    storageType: 'GDrive' | 'S3',
    storageId: string,
    subPath: string | undefined,
    remoteNamespace: string,
  ): Promise<{ cleanFs: string; gdriveRemote: string | null; s3Remote: string | null }> {
    let gdriveRemote: string | null = null;
    let s3Remote: string | null = null;
    let cleanFs = '';

    if (storageType === 'GDrive') {
      const source = await this.prisma.googleDriveSource.findUnique({
        where: { id: storageId },
      });
      if (!source) {
        throw new NotFoundException(`Google Drive source configuration not found: ${storageId}`);
      }

      const authType = source.authType || 'OAUTH';
      gdriveRemote = await this.rcloneConfig.createGdriveRemote(
        remoteNamespace,
        {
          serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
          teamDriveId: source.sharedDriveId || undefined,
          authType,
          clientId: source.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
          clientSecret: source.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
          tokenJson: source.tokenJson || process.env.GOOGLE_OAUTH_TOKEN || undefined,
        },
      );

      const drivePath = source.drivePath ? source.drivePath.replace(/^\/|\/$/g, '') : '';
      const cleanSub = subPath ? subPath.replace(/^\/|\/$/g, '') : '';
      const cleanPath = drivePath
        ? cleanSub
          ? `${drivePath}/${cleanSub}`
          : drivePath
        : cleanSub;

      cleanFs = `${gdriveRemote}:${cleanPath}`;
    } else {
      const customer = await this.prisma.customer.findUnique({
        where: { id: storageId },
      });
      if (!customer) {
        throw new NotFoundException(`S3 Customer bucket configuration not found: ${storageId}`);
      }

      const credentials = await this.stsService.assumeRole(
        customer.roleArn,
        customer.externalId || undefined,
      );
      s3Remote = await this.rcloneConfig.createS3Remote(
        remoteNamespace,
        credentials,
        customer.region,
      );

      const prefixPath = customer.prefixPath ? customer.prefixPath.trim().replace(/^\/|\/$/g, '') : '';
      const rawSubPath = (subPath || '').trim().replace(/^\/|\/$/g, '');
      let s3Path = rawSubPath;
      if (prefixPath) {
        if (rawSubPath === '') {
          s3Path = prefixPath;
        } else if (rawSubPath === prefixPath) {
          s3Path = prefixPath;
        } else if (rawSubPath.startsWith(prefixPath + '/')) {
          s3Path = rawSubPath;
        } else {
          s3Path = `${prefixPath}/${rawSubPath}`;
        }
      }

      cleanFs = `${s3Remote}:${customer.bucketName}/${s3Path}`
        .replace(/\/\/+/g, '/')
        .replace(/\/+$/, '');
    }

    return { cleanFs, gdriveRemote, s3Remote };
  }

  // ==========================================
  // DELETION OPERATIONS
  // ==========================================

  /**
   * Pre-deletion analysis to verify which objects exist in target folder
   */
  async analyzeBatchDelete(dto: AnalyzeBatchDeleteDto) {
    const csvPaths = this.parseCsvPaths(dto.csvContent);
    this.logger.log(`Analyzing ${csvPaths.length} CSV file paths against target delete folder.`);

    if (csvPaths.length === 0) {
      return {
        total: 0,
        matchedCount: 0,
        missingCount: 0,
        matched: [],
        missing: [],
      };
    }

    const jobId = uuidv4();
    const remoteNamespace = `analyze-delete-${jobId}`;

    try {
      const { cleanFs } = await this.resolveRemoteFs(
        dto.storageType,
        dto.storageId,
        dto.path,
        remoteNamespace,
      );

      this.logger.log(`Listing delete folder for analysis: [${cleanFs}]`);
      const listRes = await this.rcloneService.listDirectory(cleanFs, '', { recurse: true });
      const activeFiles = (listRes.list || [])
        .filter((item: any) => !item.IsDir)
        .map((item: any) => item.Path);

      const getBaseName = (p: string) => {
        const lastDot = p.lastIndexOf('.');
        if (lastDot === -1 || lastDot === 0) return p.toLowerCase().trim();
        const lastSlash = p.lastIndexOf('/');
        if (lastSlash !== -1 && lastDot < lastSlash) return p.toLowerCase().trim();
        return p.substring(0, lastDot).toLowerCase().trim();
      };

      const matched: string[] = [];
      const missing: string[] = [];

      if (dto.ignoreExtension) {
        const activeFilesMap = new Map<string, string[]>();
        for (const file of activeFiles) {
          const bp = getBaseName(file);
          if (!activeFilesMap.has(bp)) {
            activeFilesMap.set(bp, []);
          }
          activeFilesMap.get(bp)!.push(file);
        }

        for (const csvPath of csvPaths) {
          const normalizedCsv = getBaseName(csvPath);
          const files = activeFilesMap.get(normalizedCsv);
          if (files && files.length > 0) {
            matched.push(...files);
          } else {
            missing.push(csvPath);
          }
        }
      } else {
        const activeFilesSet = new Set(activeFiles.map((f: string) => f.toLowerCase()));
        for (const csvPath of csvPaths) {
          if (activeFilesSet.has(csvPath.toLowerCase())) {
            const originalPath = activeFiles.find((f: string) => f.toLowerCase() === csvPath.toLowerCase()) || csvPath;
            matched.push(originalPath);
          } else {
            missing.push(csvPath);
          }
        }
      }

      return {
        total: csvPaths.length,
        matchedCount: matched.length,
        missingCount: missing.length,
        matched,
        missing,
      };
    } finally {
      try {
        await this.rcloneConfig.cleanupRemotes(remoteNamespace);
      } catch (cleanupErr: any) {
        this.logger.warn(`Failed to cleanup batch analyze delete remotes: ${cleanupErr.message}`);
      }
    }
  }

  /**
   * Helper to ensure valid User ID for task creation
   */
  private async ensureValidUserId(userId?: string): Promise<string> {
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) return user.id;
    }
    const firstUser = await this.prisma.user.findFirst();
    if (firstUser) return firstUser.id;

    const newUser = await this.prisma.user.create({
      data: {
        email: 'system@databridge.local',
        name: 'System Operator',
        passwordHash: 'N/A',
        role: 'ADMIN',
      },
    });
    return newUser.id;
  }

  /**
   * Helper to get storage display name
   */
  private async getStorageName(type: 'GDrive' | 'S3', id: string): Promise<string> {
    if (type === 'GDrive') {
      if (id.startsWith('GLOBAL_')) return 'Global Google Drive Account';
      const source = await this.prisma.googleDriveSource.findUnique({ where: { id } });
      return source?.name || 'Google Drive Source';
    } else {
      const customer = await this.prisma.customer.findUnique({ where: { id } });
      return customer?.name || 'S3 Bucket';
    }
  }

  /**
   * Executes batch deletion based on CSV paths input or pre-parsed paths as a persistent Transfer task
   */
  async runBatchDelete(dto: RunBatchDeleteDto, userId?: string) {
    const paths = dto.paths && dto.paths.length > 0
      ? dto.paths
      : this.parseCsvPaths(dto.csvContent || '');
    this.logger.log(`Deleting ${paths.length} file paths.`);

    if (paths.length === 0) {
      return {
        success: true,
        total: 0,
        deletedCount: 0,
        failedCount: 0,
        failures: [],
      };
    }

    const validUserId = await this.ensureValidUserId(userId);
    const storageName = await this.getStorageName(dto.storageType, dto.storageId);

    const transfer = await this.prisma.transfer.create({
      data: {
        name: `Batch Deletion: ${storageName} (${dto.path || '/'})`,
        direction: 'PUSH',
        mode: 'MOVE',
        status: 'QUEUED',
        isBatch: true,
        sourceId: dto.storageType === 'GDrive' && !dto.storageId.startsWith('GLOBAL_') ? dto.storageId : null,
        sourceName: storageName,
        sourcePath: dto.path || '',
        customerId: dto.storageType === 'S3' ? dto.storageId : null,
        customerName: dto.storageType === 'S3' ? storageName : null,
        destinationPath: dto.path || '',
        selectedItems: paths,
        totalFiles: paths.length,
        createdById: validUserId,
      },
    });

    // Launch background worker
    this.processBackgroundDelete(transfer.id, dto, paths);

    return {
      success: true,
      message: 'Batch deletion task created and started.',
      transferId: transfer.id,
      transfer,
    };
  }

  private async processBackgroundDelete(transferId: string, dto: RunBatchDeleteDto, paths: string[]) {
    const remoteNamespace = `run-delete-${transferId}`;
    try {
      await this.prisma.transfer.update({
        where: { id: transferId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      await this.prisma.transferLog.create({
        data: {
          transferId,
          level: 'INFO',
          message: `Batch deletion started for ${paths.length} file paths.`,
        },
      });

      const { cleanFs } = await this.resolveRemoteFs(
        dto.storageType,
        dto.storageId,
        dto.path,
        remoteNamespace,
      );

      const concurrency = 32;
      let deletedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < paths.length; i += concurrency) {
        const chunk = paths.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (relativeFilePath) => {
            try {
              await this.rcloneService.deleteFile(cleanFs, relativeFilePath);
              deletedCount++;
            } catch (err: any) {
              failedCount++;
              await this.prisma.transferLog.create({
                data: {
                  transferId,
                  level: 'ERROR',
                  message: `Failed to delete ${relativeFilePath}: ${err.message}`,
                },
              });
            }
          }),
        );

        await this.prisma.transfer.update({
          where: { id: transferId },
          data: { transferredFiles: deletedCount, failedFiles: failedCount },
        });

        this.transferEvents.broadcastProgress(transferId, {
          transferId,
          status: 'RUNNING',
          totalFiles: paths.length,
          transferredFiles: deletedCount,
          failedFiles: failedCount,
          progressPercentage: Math.round(((deletedCount + failedCount) / paths.length) * 100),
        });
      }

      const finalStatus = failedCount === paths.length ? 'FAILED' : 'COMPLETED';
      await this.prisma.transfer.update({
        where: { id: transferId },
        data: { status: finalStatus, completedAt: new Date() },
      });

      await this.prisma.transferLog.create({
        data: {
          transferId,
          level: finalStatus === 'COMPLETED' ? 'INFO' : 'ERROR',
          message: `Batch deletion finished. Deleted: ${deletedCount}, Failed: ${failedCount}.`,
        },
      });

      this.transferEvents.broadcastProgress(transferId, {
        transferId,
        status: finalStatus,
        totalFiles: paths.length,
        transferredFiles: deletedCount,
        failedFiles: failedCount,
        progressPercentage: 100,
      });
    } catch (err: any) {
      this.logger.error(`Background batch delete failed for transfer ${transferId}: ${err.message}`);
      await this.prisma.transfer.update({
        where: { id: transferId },
        data: { status: 'FAILED', completedAt: new Date() },
      });
      await this.prisma.transferLog.create({
        data: {
          transferId,
          level: 'ERROR',
          message: `Batch delete job error: ${err.message}`,
        },
      });
    } finally {
      try {
        await this.rcloneConfig.cleanupRemotes(remoteNamespace);
      } catch (cleanupErr: any) {
        this.logger.warn(`Failed to cleanup batch delete remotes: ${cleanupErr.message}`);
      }
    }
  }

  // ==========================================
  // COPY OPERATIONS
  // ==========================================

  /**
   * Pre-copy analysis to verify which objects match/exist in source folder
   */
  async analyzeBatchCopy(dto: AnalyzeBatchCopyDto) {
    const csvPaths = this.parseCsvPaths(dto.csvContent);
    this.logger.log(`Analyzing ${csvPaths.length} CSV file paths against target source folder.`);

    if (csvPaths.length === 0) {
      return {
        total: 0,
        matchedCount: 0,
        missingCount: 0,
        matched: [],
        missing: [],
      };
    }

    const jobId = uuidv4();
    const remoteNamespace = `analyze-copy-${jobId}`;

    try {
      const { cleanFs: cleanSrcFs } = await this.resolveRemoteFs(
        dto.sourceType,
        dto.sourceId,
        dto.sourcePath,
        remoteNamespace,
      );

      this.logger.log(`Listing source folder for analysis: [${cleanSrcFs}]`);
      const listRes = await this.rcloneService.listDirectory(cleanSrcFs, '', { recurse: true });
      const activeFiles = (listRes.list || [])
        .filter((item: any) => !item.IsDir)
        .map((item: any) => item.Path);

      const getBaseName = (p: string) => {
        const lastDot = p.lastIndexOf('.');
        if (lastDot === -1 || lastDot === 0) return p.toLowerCase().trim();
        const lastSlash = p.lastIndexOf('/');
        if (lastSlash !== -1 && lastDot < lastSlash) return p.toLowerCase().trim();
        return p.substring(0, lastDot).toLowerCase().trim();
      };

      const matched: string[] = [];
      const missing: string[] = [];

      if (dto.ignoreExtension) {
        const activeFilesMap = new Map<string, string[]>();
        for (const file of activeFiles) {
          const bp = getBaseName(file);
          if (!activeFilesMap.has(bp)) {
            activeFilesMap.set(bp, []);
          }
          activeFilesMap.get(bp)!.push(file);
        }

        for (const csvPath of csvPaths) {
          const normalizedCsv = getBaseName(csvPath);
          const files = activeFilesMap.get(normalizedCsv);
          if (files && files.length > 0) {
            matched.push(...files);
          } else {
            missing.push(csvPath);
          }
        }
      } else {
        const activeFilesSet = new Set(activeFiles.map((f: string) => f.toLowerCase()));
        for (const csvPath of csvPaths) {
          if (activeFilesSet.has(csvPath.toLowerCase())) {
            const originalPath = activeFiles.find((f: string) => f.toLowerCase() === csvPath.toLowerCase()) || csvPath;
            matched.push(originalPath);
          } else {
            missing.push(csvPath);
          }
        }
      }

      return {
        total: csvPaths.length,
        matchedCount: matched.length,
        missingCount: missing.length,
        matched,
        missing,
      };
    } finally {
      try {
        await this.rcloneConfig.cleanupRemotes(remoteNamespace);
      } catch (cleanupErr: any) {
        this.logger.warn(`Failed to cleanup batch analyze copy remotes: ${cleanupErr.message}`);
      }
    }
  }

  /**
   * Executes batch copy of matched files from source to destination remote as a persistent Transfer task
   */
  async runBatchCopy(dto: RunBatchCopyDto, userId?: string) {
    const paths = dto.paths && dto.paths.length > 0
      ? dto.paths
      : this.parseCsvPaths(dto.csvContent || '');
    this.logger.log(`Copying ${paths.length} file paths from source to destination.`);

    if (paths.length === 0) {
      return {
        success: true,
        total: 0,
        copiedCount: 0,
        failedCount: 0,
        failures: [],
      };
    }

    const validUserId = await this.ensureValidUserId(userId);
    const srcName = await this.getStorageName(dto.sourceType, dto.sourceId);
    const dstName = await this.getStorageName(dto.destType, dto.destId);

    const isGDriveToS3 = dto.sourceType === 'GDrive' && dto.destType === 'S3' && !dto.sourceId.startsWith('GLOBAL_');
    const isS3ToGDrive = dto.sourceType === 'S3' && dto.destType === 'GDrive' && !dto.destId.startsWith('GLOBAL_');

    const transfer = await this.prisma.transfer.create({
      data: {
        name: `Batch Copy: ${srcName} → ${dstName}`,
        direction: isS3ToGDrive ? 'PULL' : 'PUSH',
        mode: 'COPY',
        status: 'QUEUED',
        isBatch: true,
        sourceId: isS3ToGDrive ? (dto.destId.startsWith('GLOBAL_') ? null : dto.destId) : (dto.sourceId.startsWith('GLOBAL_') ? null : dto.sourceId),
        sourceName: srcName,
        sourcePath: dto.sourcePath || '',
        customerId: isS3ToGDrive ? dto.sourceId : (dto.destId.startsWith('GLOBAL_') ? null : dto.destId),
        customerName: dstName,
        destinationPath: dto.destinationPath || '',
        selectedItems: paths,
        totalFiles: paths.length,
        createdById: validUserId,
      },
    });

    if (isGDriveToS3 || isS3ToGDrive) {
      await this.transfersService.startTransfer(transfer.id);
    } else {
      this.processBackgroundCopy(transfer.id, dto, paths);
    }

    return {
      success: true,
      message: 'Batch copy task created and started.',
      transferId: transfer.id,
      transfer,
    };
  }

  private async processBackgroundCopy(transferId: string, dto: RunBatchCopyDto, paths: string[]) {
    const remoteNamespace = `run-copy-${transferId}`;
    try {
      await this.prisma.transfer.update({
        where: { id: transferId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      await this.prisma.transferLog.create({
        data: {
          transferId,
          level: 'INFO',
          message: `Batch copy started for ${paths.length} file paths.`,
        },
      });

      const { cleanFs: cleanSrcFs } = await this.resolveRemoteFs(
        dto.sourceType,
        dto.sourceId,
        dto.sourcePath,
        remoteNamespace,
      );

      const { cleanFs: cleanDstFs } = await this.resolveRemoteFs(
        dto.destType,
        dto.destId,
        dto.destinationPath,
        remoteNamespace,
      );

      const concurrency = 32;
      let copiedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < paths.length; i += concurrency) {
        const chunk = paths.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (relativeFilePath) => {
            try {
              await this.rcloneService.copyFile(
                cleanSrcFs,
                relativeFilePath,
                cleanDstFs,
                relativeFilePath,
              );
              copiedCount++;
            } catch (err: any) {
              failedCount++;
              await this.prisma.transferLog.create({
                data: {
                  transferId,
                  level: 'ERROR',
                  message: `Failed to copy ${relativeFilePath}: ${err.message}`,
                },
              });
            }
          }),
        );

        await this.prisma.transfer.update({
          where: { id: transferId },
          data: { transferredFiles: copiedCount, failedFiles: failedCount },
        });

        this.transferEvents.broadcastProgress(transferId, {
          transferId,
          status: 'RUNNING',
          totalFiles: paths.length,
          transferredFiles: copiedCount,
          failedFiles: failedCount,
          progressPercentage: Math.round(((copiedCount + failedCount) / paths.length) * 100),
        });
      }

      const finalStatus = failedCount === paths.length ? 'FAILED' : 'COMPLETED';
      await this.prisma.transfer.update({
        where: { id: transferId },
        data: { status: finalStatus, completedAt: new Date() },
      });

      await this.prisma.transferLog.create({
        data: {
          transferId,
          level: finalStatus === 'COMPLETED' ? 'INFO' : 'ERROR',
          message: `Batch copy finished. Copied: ${copiedCount}, Failed: ${failedCount}.`,
        },
      });

      this.transferEvents.broadcastProgress(transferId, {
        transferId,
        status: finalStatus,
        totalFiles: paths.length,
        transferredFiles: copiedCount,
        failedFiles: failedCount,
        progressPercentage: 100,
      });
    } catch (err: any) {
      this.logger.error(`Background batch copy failed for transfer ${transferId}: ${err.message}`);
      await this.prisma.transfer.update({
        where: { id: transferId },
        data: { status: 'FAILED', completedAt: new Date() },
      });
      await this.prisma.transferLog.create({
        data: {
          transferId,
          level: 'ERROR',
          message: `Batch copy job error: ${err.message}`,
        },
      });
    } finally {
      try {
        await this.rcloneConfig.cleanupRemotes(remoteNamespace);
      } catch (cleanupErr: any) {
        this.logger.warn(`Failed to cleanup batch copy remotes: ${cleanupErr.message}`);
      }
    }
  }

  // ==========================================
  // ALL OBJECTS COPY OPERATIONS
  // ==========================================

  /**
   * List all objects in the source folder (no CSV filtering).
   * Returns every file as a "matched" item ready to copy.
   */
  async analyzeBatchCopyAllObjects(dto: AnalyzeBatchCopyAllObjectsDto) {
    const jobId = uuidv4();
    const remoteNamespace = `analyze-all-${jobId}`;

    try {
      const { cleanFs: cleanSrcFs } = await this.resolveRemoteFs(
        dto.sourceType,
        dto.sourceId,
        dto.sourcePath,
        remoteNamespace,
      );

      this.logger.log(`Listing ALL objects in source folder for batch copy: [${cleanSrcFs}]`);
      const listRes = await this.rcloneService.listDirectory(cleanSrcFs, '', { recurse: true });
      const allFiles = (listRes.list || [])
        .filter((item: any) => !item.IsDir)
        .map((item: any) => item.Path);

      this.logger.log(`Found ${allFiles.length} objects in source folder.`);

      return {
        total: allFiles.length,
        matchedCount: allFiles.length,
        missingCount: 0,
        matched: allFiles,
        missing: [],
      };
    } finally {
      try {
        await this.rcloneConfig.cleanupRemotes(remoteNamespace);
      } catch (cleanupErr: any) {
        this.logger.warn(`Failed to cleanup analyze-all remotes: ${cleanupErr.message}`);
      }
    }
  }

  // ==========================================
  // SYNC COPY OPERATIONS
  // ==========================================

  /**
   * Compare source vs destination folders and produce a sync diff report.
   * Returns toCopy (in source, not in dest), toDelete (in dest, not in source),
   * and alreadySynced (in both).
   */
  async analyzeBatchCopySync(dto: AnalyzeBatchCopySyncDto) {
    const jobId = uuidv4();
    const remoteNamespace = `analyze-sync-${jobId}`;

    try {
      // 1. List source
      const { cleanFs: cleanSrcFs } = await this.resolveRemoteFs(
        dto.sourceType,
        dto.sourceId,
        dto.sourcePath,
        remoteNamespace,
      );
      this.logger.log(`[Sync Analysis] Listing source: [${cleanSrcFs}]`);
      const srcListRes = await this.rcloneService.listDirectory(cleanSrcFs, '', { recurse: true });
      const sourceFiles = (srcListRes.list || [])
        .filter((item: any) => !item.IsDir)
        .map((item: any) => item.Path);

      // 2. List destination
      const { cleanFs: cleanDstFs } = await this.resolveRemoteFs(
        dto.destType,
        dto.destId,
        dto.destinationPath,
        remoteNamespace,
      );
      this.logger.log(`[Sync Analysis] Listing destination: [${cleanDstFs}]`);
      const dstListRes = await this.rcloneService.listDirectory(cleanDstFs, '', { recurse: true });
      const destFiles = (dstListRes.list || [])
        .filter((item: any) => !item.IsDir)
        .map((item: any) => item.Path);

      const getBaseName = (p: string) => {
        const lastDot = p.lastIndexOf('.');
        if (lastDot === -1 || lastDot === 0) return p.toLowerCase().trim();
        const lastSlash = p.lastIndexOf('/');
        if (lastSlash !== -1 && lastDot < lastSlash) return p.toLowerCase().trim();
        return p.substring(0, lastDot).toLowerCase().trim();
      };

      const toCopy: string[] = []; // in source, not in dest
      const alreadySynced: string[] = []; // in both
      const toDelete: string[] = []; // in dest, not in source

      if (dto.ignoreExtension) {
        const dstStemSet = new Set(destFiles.map((f: string) => getBaseName(f)));
        const srcStemSet = new Set(sourceFiles.map((f: string) => getBaseName(f)));

        for (const srcFile of sourceFiles) {
          const stem = getBaseName(srcFile);
          if (dstStemSet.has(stem)) {
            alreadySynced.push(srcFile);
          } else {
            toCopy.push(srcFile);
          }
        }

        for (const dstFile of destFiles) {
          const stem = getBaseName(dstFile);
          if (!srcStemSet.has(stem)) {
            toDelete.push(dstFile);
          }
        }
      } else {
        const srcSet = new Set(sourceFiles.map((f: string) => f.toLowerCase()));
        const dstSet = new Set(destFiles.map((f: string) => f.toLowerCase()));

        for (const srcFile of sourceFiles) {
          if (dstSet.has(srcFile.toLowerCase())) {
            alreadySynced.push(srcFile);
          } else {
            toCopy.push(srcFile);
          }
        }

        for (const dstFile of destFiles) {
          if (!srcSet.has(dstFile.toLowerCase())) {
            toDelete.push(dstFile);
          }
        }
      }

      this.logger.log(`[Sync Analysis] Source: ${sourceFiles.length}, Dest: ${destFiles.length}, ToCopy: ${toCopy.length}, ToDelete: ${toDelete.length}, Synced: ${alreadySynced.length}`);

      return {
        sourceTotal: sourceFiles.length,
        destTotal: destFiles.length,
        toCopyCount: toCopy.length,
        toDeleteCount: toDelete.length,
        alreadySyncedCount: alreadySynced.length,
        toCopy,
        toDelete,
        alreadySynced,
      };
    } finally {
      try {
        await this.rcloneConfig.cleanupRemotes(remoteNamespace);
      } catch (cleanupErr: any) {
        this.logger.warn(`Failed to cleanup analyze-sync remotes: ${cleanupErr.message}`);
      }
    }
  }

  /**
   * Executes a sync operation as a persistent Transfer task
   */
  async runBatchCopySync(dto: RunBatchCopySyncDto, userId?: string) {
    this.logger.log(`Sync operation: copying ${dto.toCopy.length} files, deleting ${dto.toDelete.length} files.`);

    const totalFiles = dto.toCopy.length + dto.toDelete.length;
    if (totalFiles === 0) {
      return {
        success: true,
        total: 0,
        copiedCount: 0,
        deletedCount: 0,
        failedCount: 0,
        failures: [],
      };
    }

    const validUserId = await this.ensureValidUserId(userId);
    const srcName = await this.getStorageName(dto.sourceType, dto.sourceId);
    const dstName = await this.getStorageName(dto.destType, dto.destId);

    const isGDriveToS3 = dto.sourceType === 'GDrive' && dto.destType === 'S3' && !dto.sourceId.startsWith('GLOBAL_');
    const isS3ToGDrive = dto.sourceType === 'S3' && dto.destType === 'GDrive' && !dto.destId.startsWith('GLOBAL_');

    const transfer = await this.prisma.transfer.create({
      data: {
        name: `Batch Sync: ${srcName} → ${dstName}`,
        direction: isS3ToGDrive ? 'PULL' : 'PUSH',
        mode: 'SYNC',
        status: 'QUEUED',
        isBatch: true,
        sourceId: isS3ToGDrive ? (dto.destId.startsWith('GLOBAL_') ? null : dto.destId) : (dto.sourceId.startsWith('GLOBAL_') ? null : dto.sourceId),
        sourceName: srcName,
        sourcePath: dto.sourcePath || '',
        customerId: isS3ToGDrive ? dto.sourceId : (dto.destId.startsWith('GLOBAL_') ? null : dto.destId),
        customerName: dstName,
        destinationPath: dto.destinationPath || '',
        selectedItems: dto.toCopy,
        totalFiles: totalFiles,
        createdById: validUserId,
      },
    });

    if (isGDriveToS3 || isS3ToGDrive) {
      await this.transfersService.startTransfer(transfer.id);
    } else {
      this.processBackgroundSync(transfer.id, dto);
    }

    return {
      success: true,
      message: 'Batch sync task created and started.',
      transferId: transfer.id,
      transfer,
    };
  }

  private async processBackgroundSync(transferId: string, dto: RunBatchCopySyncDto) {
    const remoteNamespace = `run-sync-${transferId}`;
    try {
      const totalFiles = dto.toCopy.length + dto.toDelete.length;
      await this.prisma.transfer.update({
        where: { id: transferId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      await this.prisma.transferLog.create({
        data: {
          transferId,
          level: 'INFO',
          message: `Batch sync started (${dto.toCopy.length} to copy, ${dto.toDelete.length} to delete).`,
        },
      });

      const { cleanFs: cleanSrcFs } = await this.resolveRemoteFs(
        dto.sourceType,
        dto.sourceId,
        dto.sourcePath,
        remoteNamespace,
      );

      const { cleanFs: cleanDstFs } = await this.resolveRemoteFs(
        dto.destType,
        dto.destId,
        dto.destinationPath,
        remoteNamespace,
      );

      const concurrency = 32;
      let processedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < dto.toCopy.length; i += concurrency) {
        const chunk = dto.toCopy.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (relativeFilePath) => {
            try {
              await this.rcloneService.copyFile(
                cleanSrcFs,
                relativeFilePath,
                cleanDstFs,
                relativeFilePath,
              );
              processedCount++;
            } catch (err: any) {
              failedCount++;
              await this.prisma.transferLog.create({
                data: {
                  transferId,
                  level: 'ERROR',
                  message: `Sync copy failed for ${relativeFilePath}: ${err.message}`,
                },
              });
            }
          }),
        );

        await this.prisma.transfer.update({
          where: { id: transferId },
          data: { transferredFiles: processedCount, failedFiles: failedCount },
        });

        this.transferEvents.broadcastProgress(transferId, {
          transferId,
          status: 'RUNNING',
          totalFiles,
          transferredFiles: processedCount,
          failedFiles: failedCount,
          progressPercentage: Math.round(((processedCount + failedCount) / totalFiles) * 100),
        });
      }

      for (let i = 0; i < dto.toDelete.length; i += concurrency) {
        const chunk = dto.toDelete.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (relativeFilePath) => {
            try {
              await this.rcloneService.deleteFile(cleanDstFs, relativeFilePath);
              processedCount++;
            } catch (err: any) {
              failedCount++;
              await this.prisma.transferLog.create({
                data: {
                  transferId,
                  level: 'ERROR',
                  message: `Sync delete failed for ${relativeFilePath}: ${err.message}`,
                },
              });
            }
          }),
        );

        await this.prisma.transfer.update({
          where: { id: transferId },
          data: { transferredFiles: processedCount, failedFiles: failedCount },
        });

        this.transferEvents.broadcastProgress(transferId, {
          transferId,
          status: 'RUNNING',
          totalFiles,
          transferredFiles: processedCount,
          failedFiles: failedCount,
          progressPercentage: Math.round(((processedCount + failedCount) / totalFiles) * 100),
        });
      }

      const finalStatus = failedCount === totalFiles ? 'FAILED' : 'COMPLETED';
      await this.prisma.transfer.update({
        where: { id: transferId },
        data: { status: finalStatus, completedAt: new Date() },
      });

      await this.prisma.transferLog.create({
        data: {
          transferId,
          level: finalStatus === 'COMPLETED' ? 'INFO' : 'ERROR',
          message: `Batch sync finished. Processed: ${processedCount}, Failed: ${failedCount}.`,
        },
      });

      this.transferEvents.broadcastProgress(transferId, {
        transferId,
        status: finalStatus,
        totalFiles,
        transferredFiles: processedCount,
        failedFiles: failedCount,
        progressPercentage: 100,
      });
    } catch (err: any) {
      this.logger.error(`Background batch sync failed for transfer ${transferId}: ${err.message}`);
      await this.prisma.transfer.update({
        where: { id: transferId },
        data: { status: 'FAILED', completedAt: new Date() },
      });
      await this.prisma.transferLog.create({
        data: {
          transferId,
          level: 'ERROR',
          message: `Batch sync job error: ${err.message}`,
        },
      });
    } finally {
      try {
        await this.rcloneConfig.cleanupRemotes(remoteNamespace);
      } catch (cleanupErr: any) {
        this.logger.warn(`Failed to cleanup sync remotes: ${cleanupErr.message}`);
      }
    }
  }
}
