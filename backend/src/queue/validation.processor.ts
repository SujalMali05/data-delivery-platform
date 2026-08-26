import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RcloneService } from '../rclone/rclone.service';
import { RcloneConfigService } from '../rclone/rclone-config.service';
import { StsService } from '../aws/sts.service';
import { VALIDATION_QUEUE } from './constants';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface ValidationJobData {
  validationId: string;
}

@Processor(VALIDATION_QUEUE, {
  concurrency: 2,
  lockDuration: 300000, // 5 minutes
})
export class ValidationProcessor extends WorkerHost {
  private readonly logger = new Logger('ValidationProcessor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rcloneService: RcloneService,
    private readonly rcloneConfig: RcloneConfigService,
    private readonly stsService: StsService,
  ) {
    super();
  }

  async process(job: Job<ValidationJobData>): Promise<void> {
    const { validationId } = job.data;
    this.logger.log(`🚀 Processing folder validation: ${validationId}`);

    let srcRemoteNamespace = `val-${validationId}-src`;
    let dstRemoteNamespace = `val-${validationId}-dst`;
    let gdriveSourceRemote: string | null = null;
    let s3SourceRemote: string | null = null;
    let gdriveDestRemote: string | null = null;
    let s3DestRemote: string | null = null;
    let validation: any = null;

    try {
      // 1. Fetch validation details
      validation = await this.prisma.validation.findUnique({
        where: { id: validationId },
        include: {
          sourceGDrive: true,
          sourceCustomer: true,
          destGDrive: true,
          destCustomer: true,
        },
      });

      if (!validation) {
        throw new Error(`Validation record not found: ${validationId}`);
      }

      // Update status to RUNNING
      await this.prisma.validation.update({
        where: { id: validationId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      // 2. Setup Source Remote
      let srcFs = '';
      let cleanSrcPath = '';
      if (validation.sourceType === 'GDrive') {
        if (!validation.sourceGDrive) {
          throw new Error('Google Drive source configuration is missing');
        }
        const sourceAuthType = validation.sourceGDrive.authType || 'OAUTH';
        gdriveSourceRemote = await this.rcloneConfig.createGdriveRemote(
          srcRemoteNamespace,
          {
            serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
            teamDriveId: validation.sourceGDrive.sharedDriveId || undefined,
            authType: sourceAuthType,
            clientId: validation.sourceGDrive.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
            clientSecret: validation.sourceGDrive.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
            tokenJson: validation.sourceGDrive.tokenJson || process.env.GOOGLE_OAUTH_TOKEN || undefined,
          },
        );

        const drivePath = validation.sourceGDrive.drivePath
          ? validation.sourceGDrive.drivePath.replace(/^\/|\/$/g, '')
          : '';
        const sourcePath = validation.sourcePath
          ? validation.sourcePath.replace(/^\/|\/$/g, '')
          : '';
        cleanSrcPath = drivePath
          ? sourcePath
            ? `${drivePath}/${sourcePath}`
            : drivePath
          : sourcePath;
        srcFs = `${gdriveSourceRemote}:${cleanSrcPath}`;
      } else {
        if (!validation.sourceCustomer) {
          throw new Error('S3 Customer source configuration is missing');
        }
        const srcCredentials = await this.stsService.assumeRole(
          validation.sourceCustomer.roleArn,
          validation.sourceCustomer.externalId || undefined,
        );
        s3SourceRemote = await this.rcloneConfig.createS3Remote(
          srcRemoteNamespace,
          srcCredentials,
          validation.sourceCustomer.region,
        );

        const prefixPath = validation.sourceCustomer.prefixPath
          ? validation.sourceCustomer.prefixPath.trim().replace(/^\/|\/$/g, '')
          : '';
        const rawSrcPath = (validation.sourcePath || '').trim().replace(/^\/|\/$/g, '');
        let s3Path = rawSrcPath;
        if (prefixPath) {
          if (rawSrcPath === '') {
            s3Path = prefixPath;
          } else if (rawSrcPath === prefixPath) {
            s3Path = prefixPath;
          } else if (rawSrcPath.startsWith(prefixPath + '/')) {
            s3Path = rawSrcPath;
          } else {
            s3Path = `${prefixPath}/${rawSrcPath}`;
          }
        }
        cleanSrcPath = s3Path;
        srcFs = `${s3SourceRemote}:${validation.sourceCustomer.bucketName}/${s3Path}`
          .replace(/\/\/+/g, '/')
          .replace(/\/+$/, '');
      }

      // 3. Setup Destination Remote
      let dstFs = '';
      let cleanDstPath = '';
      if (validation.destType === 'GDrive') {
        if (!validation.destGDrive) {
          throw new Error('Google Drive destination configuration is missing');
        }
        const destAuthType = validation.destGDrive.authType || 'OAUTH';
        gdriveDestRemote = await this.rcloneConfig.createGdriveRemote(
          dstRemoteNamespace,
          {
            serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
            teamDriveId: validation.destGDrive.sharedDriveId || undefined,
            authType: destAuthType,
            clientId: validation.destGDrive.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
            clientSecret: validation.destGDrive.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
            tokenJson: validation.destGDrive.tokenJson || process.env.GOOGLE_OAUTH_TOKEN || undefined,
          },
        );

        const drivePath = validation.destGDrive.drivePath
          ? validation.destGDrive.drivePath.replace(/^\/|\/$/g, '')
          : '';
        const destPath = validation.destinationPath
          ? validation.destinationPath.replace(/^\/|\/$/g, '')
          : '';
        cleanDstPath = drivePath
          ? destPath
            ? `${drivePath}/${destPath}`
            : drivePath
          : destPath;
        dstFs = `${gdriveDestRemote}:${cleanDstPath}`;
      } else {
        if (!validation.destCustomer) {
          throw new Error('S3 Customer destination configuration is missing');
        }
        const dstCredentials = await this.stsService.assumeRole(
          validation.destCustomer.roleArn,
          validation.destCustomer.externalId || undefined,
        );
        s3DestRemote = await this.rcloneConfig.createS3Remote(
          dstRemoteNamespace,
          dstCredentials,
          validation.destCustomer.region,
        );

        const prefixPath = validation.destCustomer.prefixPath
          ? validation.destCustomer.prefixPath.trim().replace(/^\/|\/$/g, '')
          : '';
        const rawDstPath = (validation.destinationPath || '').trim().replace(/^\/|\/$/g, '');
        let s3Path = rawDstPath;
        if (prefixPath) {
          if (rawDstPath === '') {
            s3Path = prefixPath;
          } else if (rawDstPath === prefixPath) {
            s3Path = prefixPath;
          } else if (rawDstPath.startsWith(prefixPath + '/')) {
            s3Path = rawDstPath;
          } else {
            s3Path = `${prefixPath}/${rawDstPath}`;
          }
        }
        cleanDstPath = s3Path;
        dstFs = `${s3DestRemote}:${validation.destCustomer.bucketName}/${s3Path}`
          .replace(/\/\/+/g, '/')
          .replace(/\/+$/, '');
      }

      this.logger.log(
        `Validation sources: Source [${srcFs}] | Destination [${dstFs}]`,
      );

      // 4. Retrieve directory listings of both directories recursively via rclone
      let srcFilesList: any[] = [];
      let dstFilesList: any[] = [];

      try {
        this.logger.log(`Scanning source folder recursively: ${srcFs}`);
        const listRes = await this.rcloneService.listDirectory(srcFs, '', {
          recurse: true,
        });
        srcFilesList = (listRes.list || []).filter((item: any) => !item.IsDir);
      } catch (err: any) {
        this.logger.error(`Failed to scan source folder: ${err.message}`);
        throw new Error(`Failed to list source folder: ${err.message}`);
      }

      try {
        this.logger.log(`Scanning destination folder recursively: ${dstFs}`);
        const listRes = await this.rcloneService.listDirectory(dstFs, '', {
          recurse: true,
        });
        dstFilesList = (listRes.list || []).filter((item: any) => !item.IsDir);
      } catch (err: any) {
        this.logger.error(`Failed to scan destination folder: ${err.message}`);
        throw new Error(`Failed to list destination folder: ${err.message}`);
      }

      // Calculate size summaries
      const srcBytes = srcFilesList.reduce((sum, f) => sum + BigInt(f.Size), BigInt(0));
      const srcFiles = srcFilesList.length;

      const dstBytes = dstFilesList.reduce((sum, f) => sum + BigInt(f.Size), BigInt(0));
      const dstFiles = dstFilesList.length;

      // Update db size counters
      await this.prisma.validation.update({
        where: { id: validationId },
        data: {
          srcTotalBytes: srcBytes,
          srcTotalFiles: srcFiles,
          dstTotalBytes: dstBytes,
          dstTotalFiles: dstFiles,
        },
      });

      // 5. Scan source for duplicate files
      const duplicates: any[] = [];
      let duplicatesCount = 0;
      const srcFilesByPath: Record<string, any[]> = {};
      for (const file of srcFilesList) {
        const path = file.Path;
        if (!srcFilesByPath[path]) {
          srcFilesByPath[path] = [];
        }
        srcFilesByPath[path].push(file);
      }

      for (const [path, items] of Object.entries(srcFilesByPath)) {
        if (items.length > 1) {
          duplicatesCount += items.length - 1;
          duplicates.push({
            path,
            count: items.length,
            files: items.map((item: any) => ({
              id: item.ID,
              size: item.Size,
              modTime: item.ModTime,
            })),
          });
        }
      }
      this.logger.log(`Scan completed. Found ${duplicatesCount} duplicate file copies.`);

      // 6. Custom Directory Comparison Engine
      const match: string[] = [];
      const differ: string[] = [];
      const missingOnSrc: string[] = [];
      const missingOnDst: string[] = [];
      const error: string[] = [];

      const getBaseName = (path: string) => {
        const lastDot = path.lastIndexOf('.');
        if (lastDot === -1 || lastDot === 0) return path.toLowerCase().trim();
        const lastSlash = path.lastIndexOf('/');
        if (lastSlash !== -1 && lastDot < lastSlash) return path.toLowerCase().trim();
        return path.substring(0, lastDot).toLowerCase().trim();
      };

      if (validation.ignoreExtension) {
        // Group files by their filename without extension (case-insensitive)
        const srcMap = new Map<string, any[]>();
        for (const file of srcFilesList) {
          const bp = getBaseName(file.Path);
          if (!srcMap.has(bp)) srcMap.set(bp, []);
          srcMap.get(bp)!.push(file);
        }

        const dstMap = new Map<string, any[]>();
        for (const file of dstFilesList) {
          const bp = getBaseName(file.Path);
          if (!dstMap.has(bp)) dstMap.set(bp, []);
          dstMap.get(bp)!.push(file);
        }

        // Process source files
        for (const [bp, sFiles] of srcMap.entries()) {
          const dFiles = dstMap.get(bp);
          if (dFiles) {
            // Base filename exists in both locations!
            for (const sFile of sFiles) {
              const exactDestMatch = dFiles.find(
                (df) => df.Path.toLowerCase() === sFile.Path.toLowerCase()
              );
              if (exactDestMatch) {
                // If they have the exact same extension, compare their sizes
                if (sFile.Size === exactDestMatch.Size) {
                  match.push(sFile.Path);
                } else {
                  differ.push(sFile.Path);
                }
              } else {
                // Extension differs, but base filename exists. Treated as a match under ignoreExtension logic
                match.push(sFile.Path);
              }
            }
          } else {
            // Missing on Destination
            for (const sFile of sFiles) {
              missingOnDst.push(sFile.Path);
            }
          }
        }

        // Process destination files to find missing on source
        for (const [bp, dFiles] of dstMap.entries()) {
          if (!srcMap.has(bp)) {
            for (const dFile of dFiles) {
              missingOnSrc.push(dFile.Path);
            }
          }
        }
      } else {
        // Exact matching by path (case-insensitive lookup)
        const srcMap = new Map<string, any>();
        for (const file of srcFilesList) {
          srcMap.set(file.Path.toLowerCase(), file);
        }

        const dstMap = new Map<string, any>();
        for (const file of dstFilesList) {
          dstMap.set(file.Path.toLowerCase(), file);
        }

        for (const [path, sFile] of srcMap.entries()) {
          const dFile = dstMap.get(path);
          if (dFile) {
            if (sFile.Size === dFile.Size) {
              match.push(sFile.Path);
            } else {
              differ.push(sFile.Path);
            }
          } else {
            missingOnDst.push(sFile.Path);
          }
        }

        for (const [path, dFile] of dstMap.entries()) {
          if (!srcMap.has(path)) {
            missingOnSrc.push(dFile.Path);
          }
        }
      }

      // If oneWay check is active, we ignore files missing on Source (we don't alert them as errors/mismatches)
      // Wait, in rclone, oneWay ignore means we do not report missingOnSrc.
      const finalMissingOnSrc = validation.oneWay ? [] : missingOnSrc;

      // 7. Write JSON report to disk
      const reportDir = join(process.cwd(), 'reports');
      try {
        mkdirSync(reportDir, { recursive: true });
      } catch (mkdirErr) {
        // Ignore if exists
      }

      const reportFilename = `${validationId}.json`;
      const reportPath = join(reportDir, reportFilename);

      const detailedReport = {
        validationId,
        name: validation.name,
        oneWay: validation.oneWay,
        ignoreExtension: validation.ignoreExtension,
        source: {
          name: validation.sourceType === 'GDrive' ? validation.sourceGDrive.name : validation.sourceCustomer.name,
          path: cleanSrcPath,
        },
        destination: {
          name: validation.destType === 'GDrive' ? validation.destGDrive.name : validation.destCustomer.name,
          path: cleanDstPath,
        },
        summary: {
          srcTotalBytes: srcBytes.toString(),
          srcTotalFiles: srcFiles,
          dstTotalBytes: dstBytes.toString(),
          dstTotalFiles: dstFiles,
          matchCount: match.length,
          differCount: differ.length,
          missingSrcCount: finalMissingOnSrc.length,
          missingDstCount: missingOnDst.length,
          errorCount: error.length,
          duplicatesCount,
        },
        match,
        differ,
        missingOnSrc: finalMissingOnSrc,
        missingOnDst,
        error,
        duplicates,
      };

      writeFileSync(reportPath, JSON.stringify(detailedReport, null, 2));

      // 8. Update DB validation entry to COMPLETED
      await this.prisma.validation.update({
        where: { id: validationId },
        data: {
          status: 'COMPLETED',
          matchCount: match.length,
          differCount: differ.length,
          missingSrcCount: finalMissingOnSrc.length,
          missingDstCount: missingOnDst.length,
          errorCount: error.length,
          reportPath: reportPath,
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `✅ Folder validation completed successfully: ${validationId}`,
      );
    } catch (err: any) {
      this.logger.error(
        `❌ Validation failed for ${validationId}: ${err.message}`,
      );

      try {
        await this.prisma.validation.update({
          where: { id: validationId },
          data: {
            status: 'FAILED',
            errorMessage: err.message || 'Validation process failed due to internal error',
            completedAt: new Date(),
          },
        });
      } catch (dbUpdateErr: any) {
        this.logger.error(
          `Failed to record validation failure in DB: ${dbUpdateErr.message}`,
        );
      }
    } finally {
      // 9. Cleanup dynamic remotes
      try {
        await this.rcloneConfig.cleanupRemotes(srcRemoteNamespace);
        await this.rcloneConfig.cleanupRemotes(dstRemoteNamespace);
      } catch (cleanupErr: any) {
        this.logger.warn(
          `Failed to cleanup validation remotes: ${cleanupErr.message}`,
        );
      }
    }
  }
}
