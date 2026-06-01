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

    let gdriveRemote: string | null = null;
    let s3Remote: string | null = null;
    let validation: any = null;

    try {
      // 1. Fetch validation details
      validation = await this.prisma.validation.findUnique({
        where: { id: validationId },
        include: {
          customer: true,
          source: true,
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

      // 2. Assume S3 Customer Role
      const credentials = await this.stsService.assumeRole(
        validation.customer.roleArn,
        validation.customer.externalId || undefined,
      );
      this.logger.log(`STS assumeRole successful for customer validation: ${validation.customer.name}`);

      // 3. Create Dynamic Rclone Remotes
      const remoteNamespace = `val-${validationId}`;
      const sourceAuthType = validation.source.authType || 'SERVICE_ACCOUNT';

      gdriveRemote = await this.rcloneConfig.createGdriveRemote(remoteNamespace, {
        serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
        teamDriveId: validation.source.sharedDriveId || undefined,
        authType: sourceAuthType,
        clientId: validation.source.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
        clientSecret: validation.source.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
        tokenJson: validation.source.tokenJson || process.env.GOOGLE_OAUTH_TOKEN || undefined,
      });

      s3Remote = await this.rcloneConfig.createS3Remote(
        remoteNamespace,
        credentials,
        validation.customer.region,
      );

      const drivePath = validation.source.drivePath ? validation.source.drivePath.replace(/^\/|\/$/g, '') : '';
      const sourcePath = validation.sourcePath ? validation.sourcePath.replace(/^\/|\/$/g, '') : '';
      const cleanSrcPath = drivePath ? (sourcePath ? `${drivePath}/${sourcePath}` : drivePath) : sourcePath;
      const srcFs = `${gdriveRemote}:${cleanSrcPath}`;

      let dstPath = validation.destinationPath || '';
      const prefixPath = validation.customer.prefixPath ? validation.customer.prefixPath.trim().replace(/^\/|\/$/g, '') : '';
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
      dstPath = s3Path;
      const dstFs = `${s3Remote}:${validation.customer.bucketName}/${dstPath}`.replace(/\/\/+/g, '/').replace(/\/+$/, '');

      this.logger.log(`Validation sources: Source [${srcFs}] | Destination [${dstFs}]`);

      // 3.5 Scan Google Drive source (srcFs) recursively to detect duplicates
      let duplicates: any[] = [];
      let duplicatesCount = 0;
      try {
        this.logger.log(`Scanning Google Drive for duplicates: ${srcFs}`);
        const listRes = await this.rcloneService.listDirectory(srcFs, '', { recurse: true });
        const files = (listRes.list || []).filter((item: any) => !item.IsDir);
        
        const filesByPath: Record<string, any[]> = {};
        for (const file of files) {
          const path = file.Path;
          if (!filesByPath[path]) {
            filesByPath[path] = [];
          }
          filesByPath[path].push(file);
        }

        for (const [path, items] of Object.entries(filesByPath)) {
          if (items.length > 1) {
            duplicatesCount += (items.length - 1);
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
      } catch (err: any) {
        this.logger.warn(`Failed to scan Google Drive for duplicates: ${err.message}`);
      }

      // 4. Sizing Calculations
      let srcBytes = BigInt(0);
      let srcFiles = 0;
      let dstBytes = BigInt(0);
      let dstFiles = 0;

      try {
        const srcSize = await this.rcloneService.calculateSize(srcFs, '');
        srcBytes = BigInt(srcSize.bytes);
        srcFiles = srcSize.count;
      } catch (err: any) {
        this.logger.warn(`Failed to pre-calculate source folder size: ${err.message}`);
      }

      try {
        const dstSize = await this.rcloneService.calculateSize(dstFs, '');
        dstBytes = BigInt(dstSize.bytes);
        dstFiles = dstSize.count;
      } catch (err: any) {
        this.logger.warn(`Failed to pre-calculate destination folder size: ${err.message}`);
      }

      await this.prisma.validation.update({
        where: { id: validationId },
        data: {
          srcTotalBytes: srcBytes,
          srcTotalFiles: srcFiles,
          dstTotalBytes: dstBytes,
          dstTotalFiles: dstFiles,
        },
      });

      // 5. Start Integrity check asynchronously
      const result = await this.rcloneService.startCheck(
        srcFs,
        dstFs,
        remoteNamespace,
        validation.oneWay,
      );

      const rcloneJobId = result.jobid;
      this.logger.log(`Folder check started on rclone (jobId: ${rcloneJobId})`);

      // 6. Polling monitoring loop
      let finished = false;
      let checkOutput: any = null;

      while (!finished) {
        await this.sleep(10000); // Poll every 10 seconds

        const jobStatus = await this.rcloneService.getJobStatus(rcloneJobId);
        if (jobStatus.finished) {
          finished = true;
          if (jobStatus.success) {
            checkOutput = jobStatus.output || {};
          } else {
            throw new Error(`rclone check job failed: ${jobStatus.error || 'Unknown error'}`);
          }
        }
      }

      // 7. Process check results and write JSON report to disk
      const match = checkOutput.match || [];
      const differ = checkOutput.differ || [];
      const missingOnSrc = checkOutput.missingOnSrc || [];
      const missingOnDst = checkOutput.missingOnDst || [];
      const error = checkOutput.error || [];

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
        source: {
          name: validation.source.name,
          path: cleanSrcPath,
        },
        destination: {
          customer: validation.customer.name,
          bucket: validation.customer.bucketName,
          path: dstPath.replace(/\/\/+/g, '/').replace(/\/+$/, ''),
        },
        summary: {
          srcTotalBytes: srcBytes.toString(),
          srcTotalFiles: srcFiles,
          dstTotalBytes: dstBytes.toString(),
          dstTotalFiles: dstFiles,
          matchCount: match.length,
          differCount: differ.length,
          missingSrcCount: missingOnSrc.length,
          missingDstCount: missingOnDst.length,
          errorCount: error.length,
          duplicatesCount,
        },
        match,
        differ,
        missingOnSrc,
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
          missingSrcCount: missingOnSrc.length,
          missingDstCount: missingOnDst.length,
          errorCount: error.length,
          reportPath: reportPath,
          completedAt: new Date(),
        },
      });

      this.logger.log(`✅ Folder validation completed successfully: ${validationId}`);

    } catch (err: any) {
      this.logger.error(`❌ Validation failed for ${validationId}: ${err.message}`);

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
        this.logger.error(`Failed to record validation failure in DB: ${dbUpdateErr.message}`);
      }
    } finally {
      // 9. Cleanup dynamic remotes
      if (validation) {
        const remoteNamespace = `val-${validationId}`;
        try {
          await this.rcloneConfig.cleanupRemotes(remoteNamespace);
        } catch (cleanupErr: any) {
          this.logger.warn(`Failed to cleanup validation remotes for ${remoteNamespace}: ${cleanupErr.message}`);
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
