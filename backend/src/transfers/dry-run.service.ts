import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RcloneService } from '../rclone/rclone.service';
import { RcloneConfigService } from '../rclone/rclone-config.service';
import { StsService } from '../aws/sts.service';

export interface DryRunReport {
  source: {
    type: 'gdrive' | 's3';
    name: string;
    bucket?: string;
    path: string;
    totalFiles: number;
    totalBytes: string;
  };
  destination: {
    type: 'gdrive' | 's3';
    name: string;
    bucket?: string;
    path: string;
    totalFiles: number;
    totalBytes: string;
  };
  summary: {
    filesToTransfer: number;
    filesToDelete: number;
    bytesToTransfer: number;
    checksPerformed: number;
    errors: number;
  };
}

@Injectable()
export class DryRunService {
  private readonly logger = new Logger('DryRunService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rcloneService: RcloneService,
    private readonly rcloneConfig: RcloneConfigService,
    private readonly stsService: StsService,
  ) {}

  /**
   * Run a dry-run sync to generate a report of what would change.
   * Creates temporary remotes, runs rclone sync --dry-run, collects stats, and cleans up.
   */
  async generateReport(params: {
    sourceId: string;
    customerId: string;
    destinationPath: string;
    direction?: 'PUSH' | 'PULL';
    checkers?: number;
    mode?: 'COPY' | 'SYNC' | 'MOVE';
    skipDeletion?: boolean;
  }): Promise<DryRunReport> {
    const dryRunId = `dryrun-${Date.now()}`;
    let gdriveRemote: string | null = null;
    let s3Remote: string | null = null;

    try {
      // 1. Load source and customer
      const source = await this.prisma.googleDriveSource.findUnique({
        where: { id: params.sourceId },
      });
      if (!source) throw new Error(`Google Drive source not found: ${params.sourceId}`);

      const customer = await this.prisma.customer.findUnique({
        where: { id: params.customerId },
      });
      if (!customer) throw new Error(`Customer not found: ${params.customerId}`);

      // 2. AssumeRole for customer S3
      const credentials = await this.stsService.assumeRole(
        customer.roleArn,
        customer.externalId || undefined,
      );
      this.logger.log(`Dry-run: STS AssumeRole successful for ${customer.name}`);

      // 3. Create temporary rclone remotes
      const sourceAuthType = source.authType || 'SERVICE_ACCOUNT';
      gdriveRemote = await this.rcloneConfig.createGdriveRemote(dryRunId, {
        serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
        teamDriveId: source.sharedDriveId || undefined,
        authType: sourceAuthType as 'SERVICE_ACCOUNT' | 'OAUTH',
        clientId: source.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
        clientSecret: source.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
        tokenJson: source.tokenJson || process.env.GOOGLE_OAUTH_TOKEN || undefined,
      });

      s3Remote = await this.rcloneConfig.createS3Remote(
        dryRunId,
        credentials,
        customer.region,
      );

      // 4. Build source and destination FS paths
      const isPull = params.direction === 'PULL';
      const gdriveFs = `${gdriveRemote}:${source.drivePath}`;
      
      let dstPath = params.destinationPath || '';
      const prefixPath = customer.prefixPath ? customer.prefixPath.trim().replace(/^\/|\/$/g, '') : '';
      const cleanDstPath = dstPath.trim().replace(/^\/|\/$/g, '');

      let s3Path = cleanDstPath;
      if (prefixPath) {
        if (cleanDstPath === '') {
          s3Path = prefixPath;
        } else if (cleanDstPath === prefixPath) {
          s3Path = prefixPath;
        } else if (cleanDstPath.startsWith(prefixPath + '/')) {
          s3Path = cleanDstPath;
        } else {
          s3Path = `${prefixPath}/${cleanDstPath}`;
        }
      }
      const s3Fs = `${s3Remote}:${customer.bucketName}/${s3Path}`.replace(/\/\/+/g, '/').replace(/\/+$/, '');

      const srcFs = isPull ? s3Fs : gdriveFs;
      const dstFs = isPull ? gdriveFs : s3Fs;

      // Determine effective mode for dry-run
      const mode = (params.mode || 'SYNC').toLowerCase() as 'copy' | 'sync' | 'move';
      let effectiveMode = mode;
      if (params.skipDeletion && mode === 'sync') {
        effectiveMode = 'copy';
      }

      // 5. Run size calculations and dry-run sync in parallel
      this.logger.log(`Dry-run: Initiating source size, destination size, and dry-run sync in parallel...`);
      const [srcSizeRes, dstSizeRes, dryRunStartRes] = await Promise.allSettled([
        this.rcloneService.calculateSize(srcFs, ''),
        this.rcloneService.calculateSize(dstFs, ''),
        this.rcloneService.startDryRun(
          srcFs,
          dstFs,
          dryRunId,
          effectiveMode,
          { checkers: params.checkers || 32 },
        ),
      ]);

      let srcTotalFiles = 0;
      let srcTotalBytes = BigInt(0);
      if (srcSizeRes.status === 'fulfilled') {
        srcTotalFiles = srcSizeRes.value.count;
        srcTotalBytes = BigInt(srcSizeRes.value.bytes);
        this.logger.log(`Dry-run: Source size calculated: ${srcTotalFiles} files, ${srcTotalBytes} bytes`);
      } else {
        this.logger.warn(`Dry-run: Failed to calculate source size: ${srcSizeRes.reason.message}`);
      }

      let dstTotalFiles = 0;
      let dstTotalBytes = BigInt(0);
      if (dstSizeRes.status === 'fulfilled') {
        dstTotalFiles = dstSizeRes.value.count;
        dstTotalBytes = BigInt(dstSizeRes.value.bytes);
        this.logger.log(`Dry-run: Destination size calculated: ${dstTotalFiles} files, ${dstTotalBytes} bytes`);
      } else {
        this.logger.warn(`Dry-run: Failed to calculate destination size: ${dstSizeRes.reason.message}`);
      }

      if (dryRunStartRes.status === 'rejected') {
        throw new Error(`Failed to start dry-run: ${dryRunStartRes.reason.message}`);
      }

      const result = dryRunStartRes.value;
      this.logger.log(`Dry-run job started (jobId: ${result.jobid}). Monitoring...`);

      // 7. Monitor until completion
      let finished = false;
      let finalJobStatus: any = null;
      while (!finished) {
        await this.sleep(1000);
        const jobStatus = await this.rcloneService.getJobStatus(result.jobid);
        if (jobStatus.finished) {
          finished = true;
          finalJobStatus = jobStatus;
          if (!jobStatus.success) {
            // Dry-run may "fail" if there are differences — that's expected for sync
            this.logger.warn(`Dry-run job finished with success=false: ${jobStatus.error || 'unknown'}`);
          }
        }
      }

      // 8. Collect stats from job status result
      let filesToTransfer = 0;
      let filesToDelete = 0;
      let bytesToTransfer = 0;
      let checksPerformed = 0;
      let errors = 0;

      if (finalJobStatus && finalJobStatus.output && typeof finalJobStatus.output.result === 'string') {
        const resultText = finalJobStatus.output.result;
        const lines = resultText.split('\n');
        for (const line of lines) {
          // Parse Transferred files: "Transferred:            4 / 4, 100%"
          const transferredFilesMatch = line.match(/^\s*Transferred:\s+(\d+)\s*\/\s*(\d+)/);
          if (transferredFilesMatch) {
            filesToTransfer = parseInt(transferredFilesMatch[2], 10);
          }

          // Parse Transferred bytes: "Transferred:   	  662.324 MiB / 662.324 MiB"
          const bytesMatch = line.match(/^\s*Transferred:\s+([\d\.]+)\s*(\w+)\s*\/\s*([\d\.]+)\s*(\w+)/);
          if (bytesMatch) {
            const val = parseFloat(bytesMatch[3]);
            const unit = bytesMatch[4].toLowerCase();
            let multiplier = 1;
            if (unit.startsWith('k')) multiplier = 1024;
            else if (unit.startsWith('m')) multiplier = 1024 * 1024;
            else if (unit.startsWith('g')) multiplier = 1024 * 1024 * 1024;
            else if (unit.startsWith('t')) multiplier = 1024 * 1024 * 1024 * 1024;
            bytesToTransfer = Math.round(val * multiplier);
          }

          // Parse Checks: "Checks:                 4 / 4, 100%"
          const checksMatch = line.match(/^\s*Checks:\s+(\d+)\s*\/\s*(\d+)/);
          if (checksMatch) {
            checksPerformed = parseInt(checksMatch[2], 10);
          }

          // Parse Deleted files: "Deleted:                4"
          const deletedMatch = line.match(/^\s*Deleted:\s+(\d+)/);
          if (deletedMatch) {
            filesToDelete = parseInt(deletedMatch[1], 10);
          }

          // In dry-run, rclone logs deletions as notices
          if (line.includes('Skipped delete as --dry-run is set') || line.includes('Skipped delete')) {
            filesToDelete++;
          }

          // Parse Errors: "Errors:                 1"
          const errorsMatch = line.match(/^\s*Errors:\s+(\d+)/);
          if (errorsMatch) {
            errors = parseInt(errorsMatch[1], 10);
          }
        }
      }

      if (finalJobStatus && !finalJobStatus.success && finalJobStatus.error) {
        errors = errors || 1;
      }

      // 9. Build report
      const report: DryRunReport = {
        source: isPull ? {
          type: 's3',
          name: customer.name,
          bucket: customer.bucketName,
          path: s3Path,
          totalFiles: srcTotalFiles,
          totalBytes: srcTotalBytes.toString(),
        } : {
          type: 'gdrive',
          name: source.name,
          path: source.drivePath,
          totalFiles: srcTotalFiles,
          totalBytes: srcTotalBytes.toString(),
        },
        destination: isPull ? {
          type: 'gdrive',
          name: source.name,
          path: source.drivePath,
          totalFiles: dstTotalFiles,
          totalBytes: dstTotalBytes.toString(),
        } : {
          type: 's3',
          name: customer.name,
          bucket: customer.bucketName,
          path: s3Path,
          totalFiles: dstTotalFiles,
          totalBytes: dstTotalBytes.toString(),
        },
        summary: {
          filesToTransfer,
          filesToDelete,
          bytesToTransfer,
          checksPerformed,
          errors,
        },
      };

      this.logger.log(`Dry-run report generated: ${filesToTransfer} to transfer, ${filesToDelete} to delete`);
      return report;

    } finally {
      // Cleanup
      try {
        await this.rcloneConfig.cleanupRemotes(dryRunId);
        this.logger.log(`Dry-run remotes cleaned up: ${dryRunId}`);
      } catch (cleanupErr: any) {
        this.logger.warn(`Failed to cleanup dry-run remotes: ${cleanupErr.message}`);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
