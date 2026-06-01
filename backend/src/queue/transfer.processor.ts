import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RcloneService } from '../rclone/rclone.service';
import { RcloneConfigService } from '../rclone/rclone-config.service';
import { StsService, TemporaryCredentials } from '../aws/sts.service';
import { TransferEventsService } from '../transfers/transfer-events.service';
import { TransfersService } from '../transfers/transfers.service';
import {
  TRANSFER_QUEUE,
  PROGRESS_POLL_INTERVAL_MS,
  SNAPSHOT_INTERVAL_MS,
  CREDENTIAL_REFRESH_INTERVAL_MS,
} from './constants';

export interface TransferJobData {
  transferId: string;
}

@Processor(TRANSFER_QUEUE, {
  concurrency: 3,
  lockDuration: 300000, // 5 minutes to prevent lock expiration under high CPU load
})
export class TransferProcessor extends WorkerHost {
  private readonly logger = new Logger('TransferProcessor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rcloneService: RcloneService,
    private readonly rcloneConfig: RcloneConfigService,
    private readonly stsService: StsService,
    private readonly transferEvents: TransferEventsService,
    @Inject(forwardRef(() => TransfersService))
    private readonly transfersService: TransfersService,
  ) {
    super();
  }

  async process(job: Job<TransferJobData>): Promise<void> {
    const { transferId } = job.data;
    this.logger.log(`🚀 Processing transfer: ${transferId}`);

    let gdriveRemote: string | null = null;
    let s3Remote: string | null = null;
    let isPull = false;
    let dstFs = '';

    let attempts = 0;
    const maxTokenExpiredRetries = 5;
    let transfer: any = null;

    try {
      while (attempts < maxTokenExpiredRetries) {
        try {
          // Load transfer with relations (inside loop to get fresh baseline progress on retries)
          transfer = await this.prisma.transfer.findUnique({
            where: { id: transferId },
            include: {
              customer: true,
              source: true,
            },
          });

          if (!transfer) {
            throw new Error(`Transfer not found: ${transferId}`);
          }

          // ── Step 1: AssumeRole for customer (always needed for monitoring session) ──
          let credentials = await this.stsService.assumeRole(
            transfer.customer.roleArn,
            transfer.customer.externalId || undefined,
          );
          if (attempts === 0) {
            await this.logTransfer(transferId, 'INFO', 'AssumeRole successful');
          } else {
            await this.logTransfer(
              transferId,
              'INFO',
              `STS credentials re-assumed (attempt ${attempts + 1}/${maxTokenExpiredRetries})`,
            );
          }

          // ── Step 2: Check for existing active rclone job (only on first attempt, not on token/network retries) ──
          const activeJobId = attempts === 0 ? await this.rcloneService.getActiveJobId(transferId) : null;
          let rcloneJobId = activeJobId;

          if (activeJobId) {
            this.logger.log(`Found active background rclone job ${activeJobId} for transfer ${transferId}. Reconnecting...`);
            await this.logTransfer(
              transferId,
              'INFO',
              `Reconnected to active background rclone job (jobId: ${activeJobId})`,
            );
            
            // If the status in database isn't RUNNING, reset it back to RUNNING
            if (transfer.status !== 'RUNNING') {
              await this.updateTransferStatus(transferId, 'RUNNING');
            }

            // Verify and recreate remotes if they were cleaned up or lost
            const s3RemoteName = `s3-${transferId}`;
            const gdriveRemoteName = `gdrive-${transferId}`;

            const s3Exists = await this.rcloneService.remoteExists(s3RemoteName);
            if (!s3Exists) {
              this.logger.log(`Reconnecting: S3 remote ${s3RemoteName} is missing in rclone. Re-creating...`);
              await this.rcloneConfig.createS3Remote(
                transferId,
                credentials,
                transfer.customer.region,
              );
            }

            const gdriveExists = await this.rcloneService.remoteExists(gdriveRemoteName);
            if (!gdriveExists) {
              this.logger.log(`Reconnecting: Google Drive remote ${gdriveRemoteName} is missing in rclone. Re-creating...`);
              const sourceAuthType = transfer.source.authType || 'SERVICE_ACCOUNT';
              await this.rcloneConfig.createGdriveRemote(transferId, {
                serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
                teamDriveId: transfer.source.sharedDriveId || undefined,
                authType: sourceAuthType,
                clientId: transfer.source.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
                clientSecret: transfer.source.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
                tokenJson: transfer.source.tokenJson || process.env.GOOGLE_OAUTH_TOKEN || undefined,
              });
            }

            s3Remote = s3RemoteName;
            gdriveRemote = gdriveRemoteName;

            isPull = transfer.direction === 'PULL';
            const gdriveFs = `${gdriveRemote}:${transfer.source.drivePath}`;
            let dstPath = transfer.destinationPath || '';
            const prefixPath = transfer.customer.prefixPath ? transfer.customer.prefixPath.trim().replace(/^\/|\/$/g, '') : '';
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
            const s3Fs = `${s3Remote}:${transfer.customer.bucketName}/${s3Path}`.replace(/\/\/+/g, '/').replace(/\/+$/, '');
            dstFs = isPull ? gdriveFs : s3Fs;
          } else {
            // On first attempt, prevent duplicate processing if already completed/cancelled
            if (attempts === 0 && (transfer.status === 'COMPLETED' || transfer.status === 'CANCELLED')) {
              this.logger.warn(`⚠️ Transfer ${transferId} is already in ${transfer.status} state. Skipping process.`);
              return;
            }

            // Update status to RUNNING if not already
            await this.updateTransferStatus(transferId, 'RUNNING');
            if (attempts === 0) {
              await this.logTransfer(transferId, 'INFO', 'Transfer started');
            }

            // ── Step 3: Create dynamic rclone remotes ─────────────
            const sourceAuthType = transfer.source.authType || 'SERVICE_ACCOUNT';
            gdriveRemote = await this.rcloneConfig.createGdriveRemote(transferId, {
              serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
              teamDriveId: transfer.source.sharedDriveId || undefined,
              authType: sourceAuthType,
              clientId: transfer.source.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
              clientSecret: transfer.source.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
              tokenJson: transfer.source.tokenJson || process.env.GOOGLE_OAUTH_TOKEN || undefined,
            });

            s3Remote = await this.rcloneConfig.createS3Remote(
              transferId,
              credentials,
              transfer.customer.region,
            );

            // ── Step 4: Start rclone transfer ─────────────────────
            isPull = transfer.direction === 'PULL';
            const gdriveFs = `${gdriveRemote}:${transfer.source.drivePath}`;
            let dstPath = transfer.destinationPath || '';
            const prefixPath = transfer.customer.prefixPath ? transfer.customer.prefixPath.trim().replace(/^\/|\/$/g, '') : '';
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
            const s3Fs = `${s3Remote}:${transfer.customer.bucketName}/${s3Path}`.replace(/\/\/+/g, '/').replace(/\/+$/, '');

            const srcFs = isPull ? s3Fs : gdriveFs;
            dstFs = isPull ? gdriveFs : s3Fs;
            const mode = transfer.mode.toLowerCase() as 'copy' | 'sync' | 'move';



            const result = await this.rcloneService.startTransfer(
              srcFs,
              dstFs,
              mode,
              transferId,
              {
                transfers: transfer.concurrency,
                checkers: transfer.checkers,
                retries: transfer.retries,
                bandwidthLimit: transfer.bandwidthLimit || undefined,
              },
            );

            rcloneJobId = result.jobid;

            await this.prisma.transfer.update({
              where: { id: transferId },
              data: {
                rcloneJobId: result.jobid,
                rcloneGroup: transferId,
                startedAt: new Date(),
              },
            });

            await this.logTransfer(
              transferId,
              'INFO',
              `rclone ${mode} started/resumed (jobId: ${result.jobid})`,
            );
          }

          // ── Step 5: Monitor progress until completion ─────────
          if (rcloneJobId === null) {
            throw new Error('Failed to resolve active or newly started rclone job ID');
          }
          await this.monitorTransfer(transferId, rcloneJobId, credentials, transfer);

          // Check current status before marking completed (handles pause/cancel cleanly)
          const currentStatus = await this.prisma.transfer.findUnique({
            where: { id: transferId },
            select: { status: true },
          });
          if (currentStatus?.status === 'PAUSED' || currentStatus?.status === 'CANCELLED') {
            this.logger.log(`Job processor exiting cleanly because transfer is in ${currentStatus.status} status.`);
            await this.transfersService.processNextQueuedTransfer();
            return;
          }

          // ── Step 6: Mark as completed ─────────────────────────


          await this.updateTransferStatus(transferId, 'COMPLETED');
          await this.logTransfer(transferId, 'INFO', '✅ Transfer completed successfully');

          this.logger.log(`✅ Transfer completed: ${transferId}`);
          break;
        } catch (error: any) {
          const errorMsg = error.message || '';
          const isTokenExpired = errorMsg.includes('ExpiredToken') ||
                                 errorMsg.includes('token has expired') ||
                                 errorMsg.includes('Token has expired') ||
                                 errorMsg.includes('RequestExpired') ||
                                 errorMsg.includes('SecurityTokenExpired');

          const isNetworkError = errorMsg.includes('no such host') ||
                                 errorMsg.includes('dial tcp') ||
                                 errorMsg.includes('connection refused') ||
                                 errorMsg.includes('network is unreachable') ||
                                 errorMsg.includes('i/o timeout') ||
                                 errorMsg.includes('request send failed') ||
                                 errorMsg.includes('StatusCode: 0') ||
                                 errorMsg.includes('socket: connection');

          if ((isTokenExpired || isNetworkError) && attempts < maxTokenExpiredRetries - 1) {
            attempts++;
            
            if (isTokenExpired) {
              this.logger.warn(
                `⚠️ Transfer failed due to expired token (attempt ${attempts}/${maxTokenExpiredRetries}). Refreshing credentials and resuming...`,
              );
              await this.logTransfer(
                transferId,
                'WARN',
                `Temporary credentials expired. Refreshing STS token and resuming transfer (attempt ${attempts}/${maxTokenExpiredRetries}).`,
              );
            } else {
              this.logger.warn(
                `⚠️ Transfer failed due to network disruption (attempt ${attempts}/${maxTokenExpiredRetries}). Waiting 30 seconds before resuming...`,
              );
              await this.logTransfer(
                transferId,
                'WARN',
                `Network disruption detected (${errorMsg}). Waiting 30 seconds before retrying (attempt ${attempts}/${maxTokenExpiredRetries}).`,
              );
              await this.sleep(30000);
            }

            // Clean up old rclone jobs and remotes first before recreating them
            try {
              const oldActiveJobId = await this.rcloneService.getActiveJobId(transferId);
              if (oldActiveJobId) {
                this.logger.log(`Stopping expired/failed rclone job ${oldActiveJobId} before retry...`);
                await this.rcloneService.stopJob(oldActiveJobId);
              }
              await this.rcloneConfig.cleanupRemotes(transferId);
            } catch (cleanupErr: any) {
              this.logger.warn(`Failed to cleanup remotes/jobs during retry: ${cleanupErr.message}`);
            }

            continue;
          } else {
            this.logger.error(`❌ Transfer failed: ${transferId} - ${errorMsg}`);
            await this.updateTransferStatus(transferId, 'FAILED');
            await this.logTransfer(transferId, 'ERROR', `Transfer failed: ${errorMsg}`);
            throw error;
          }
        }
      }
    } finally {
      // ── Cleanup ───────────────────────────────────────────
      if (gdriveRemote || s3Remote) {
        await this.rcloneConfig.cleanupRemotes(transferId);
        await this.logTransfer(transferId, 'INFO', 'Temporary remotes cleaned up');
      }
    }
  }

  /**
   * Poll rclone RC for progress and refresh credentials as needed
   */
  private async monitorTransfer(
    transferId: string,
    rcloneJobId: number,
    credentials: TemporaryCredentials,
    transfer: any,
  ): Promise<void> {
    let lastSnapshotTime = Date.now();
    let lastCredentialRefreshTime = Date.now();
    let currentCredentials = credentials;

    // Retrieve baseline from database to correctly display resume progress (e.g. continuing from 44 / 244 files)
    // To prevent double-addition during backend reconnects, we subtract any already reported progress from this active rclone job run.
    let initialStatsBytes = BigInt(0);
    let initialStatsFiles = 0;
    try {
      const stats = await this.rcloneService.getStats(transferId);
      initialStatsBytes = BigInt(stats.bytes || 0);
      initialStatsFiles = stats.transfers || 0;
    } catch (statsErr: any) {
      this.logger.warn(`Failed to fetch initial stats for baseline calculation: ${statsErr.message}`);
    }

    const dbTransferredBytes = transfer.transferredBytes || BigInt(0);
    const dbTransferredFiles = transfer.transferredFiles || 0;

    const baselineBytes = dbTransferredBytes > initialStatsBytes 
      ? dbTransferredBytes - initialStatsBytes 
      : BigInt(0);
    const baselineFiles = dbTransferredFiles > initialStatsFiles
      ? dbTransferredFiles - initialStatsFiles
      : 0;

    while (true) {
      // Check job status
      const jobStatus = await this.rcloneService.getJobStatus(rcloneJobId);

      if (jobStatus.finished) {
        if (!jobStatus.success) {
          // Check if user paused or stopped the transfer
          const current = await this.prisma.transfer.findUnique({
            where: { id: transferId },
            select: { status: true },
          });
          if (current?.status === 'PAUSED' || current?.status === 'CANCELLED') {
            this.logger.log(`Transfer ${transferId} was ${current.status.toLowerCase()} by user. Exiting monitor loop cleanly.`);
            return;
          }
          throw new Error(`rclone job failed: ${jobStatus.error || 'Unknown error'}`);
        }
        break; // Transfer complete
      }

      // Get transfer stats
      try {
        const stats = await this.rcloneService.getStats(transferId);

        // Add baseline values to compute absolute progress
        const absoluteTransferredBytes = baselineBytes + BigInt(stats.bytes || 0);
        const absoluteTotalBytes = baselineBytes + BigInt(stats.totalBytes || 0);
        const absoluteTransferredFiles = baselineFiles + (stats.transfers || 0);
        const absoluteTotalFiles = baselineFiles + (stats.totalTransfers || 0);

        // Update transfer record
        await this.prisma.transfer.update({
          where: { id: transferId },
          data: {
            transferredBytes: absoluteTransferredBytes,
            totalBytes: absoluteTotalBytes,
            transferredFiles: absoluteTransferredFiles,
            totalFiles: absoluteTotalFiles,
            errorCount: stats.errors || 0,
            currentSpeed: this.formatSpeed(stats.speed),
            eta: stats.eta ? this.formatEta(stats.eta) : null,
          },
        });

        // Broadcast via SSE
        this.transferEvents.broadcastProgress(transferId, {
          transferredBytes: Number(absoluteTransferredBytes),
          totalBytes: Number(absoluteTotalBytes),
          transferredFiles: absoluteTransferredFiles,
          totalFiles: absoluteTotalFiles,
          errorCount: stats.errors || 0,
          speed: this.formatSpeed(stats.speed),
          eta: stats.eta ? this.formatEta(stats.eta) : null,
          status: 'RUNNING',
        });

        // Store progress snapshot every 30 seconds
        if (Date.now() - lastSnapshotTime >= SNAPSHOT_INTERVAL_MS) {
          await this.prisma.progressSnapshot.create({
            data: {
              transferId,
              bytesTransferred: absoluteTransferredBytes,
              filesTransferred: absoluteTransferredFiles,
              speed: this.formatSpeed(stats.speed),
              eta: stats.eta ? this.formatEta(stats.eta) : null,
              errorCount: stats.errors || 0,
            },
          });
          lastSnapshotTime = Date.now();
        }
      } catch (statsError: any) {
        this.logger.warn(`Stats poll error for ${transferId}: ${statsError.message}`);
      }

      // Refresh credentials every 50 minutes
      if (Date.now() - lastCredentialRefreshTime >= CREDENTIAL_REFRESH_INTERVAL_MS) {
        try {
          this.logger.log(`Refreshing credentials for transfer: ${transferId}`);
          currentCredentials = await this.stsService.assumeRole(
            transfer.customer.roleArn,
            transfer.customer.externalId || undefined,
          );
          await this.rcloneConfig.refreshS3Credentials(transferId, currentCredentials);
          await this.logTransfer(transferId, 'INFO', 'STS credentials refreshed');
        } catch (refreshError: any) {
          await this.logTransfer(
            transferId,
            'WARN',
            `Credential refresh failed: ${refreshError.message}`,
          );
        } finally {
          lastCredentialRefreshTime = Date.now();
        }
      }

      // Wait before next poll
      await this.sleep(PROGRESS_POLL_INTERVAL_MS);
    }

    // ── Final update after loop completion ───────────────────
    try {
      this.logger.log(`Performing final stats update for transfer: ${transferId}`);
      const stats = await this.rcloneService.getStats(transferId);

      const absoluteTransferredBytes = baselineBytes + BigInt(stats.bytes || 0);
      const absoluteTotalBytes = baselineBytes + BigInt(stats.totalBytes || 0);
      const absoluteTransferredFiles = baselineFiles + (stats.transfers || 0);
      const absoluteTotalFiles = baselineFiles + (stats.totalTransfers || 0);

      await this.prisma.transfer.update({
        where: { id: transferId },
        data: {
          transferredBytes: absoluteTransferredBytes,
          totalBytes: absoluteTotalBytes,
          transferredFiles: absoluteTransferredFiles,
          totalFiles: absoluteTotalFiles,
          errorCount: stats.errors || 0,
          currentSpeed: '0 B/s',
          eta: 'Completed',
        },
      });

      // Broadcast final progress via SSE
      this.transferEvents.broadcastProgress(transferId, {
        transferredBytes: Number(absoluteTransferredBytes),
        totalBytes: Number(absoluteTotalBytes),
        transferredFiles: absoluteTransferredFiles,
        totalFiles: absoluteTotalFiles,
        errorCount: stats.errors || 0,
        speed: '0 B/s',
        eta: 'Completed',
        status: 'RUNNING',
      });
    } catch (statsError: any) {
      this.logger.warn(`Final stats poll error for ${transferId}: ${statsError.message}`);
    }
  }

  private async updateTransferStatus(
    transferId: string,
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'CANCELLED',
  ) {
    const data: any = { status };
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
      data.completedAt = new Date();
    }

    if (status === 'COMPLETED') {
      const current = await this.prisma.transfer.findUnique({ where: { id: transferId } });
      if (current) {
        // Ensure progress shows 100% completed
        data.transferredBytes = current.totalBytes > BigInt(0) ? current.totalBytes : current.transferredBytes;
        data.transferredFiles = current.totalFiles > 0 ? current.totalFiles : current.transferredFiles;
        data.currentSpeed = '0 B/s';
        data.eta = 'Completed';
      }
    } else if (status === 'FAILED' || status === 'CANCELLED') {
      data.currentSpeed = '0 B/s';
      data.eta = '—';
    }

    const updated = await this.prisma.transfer.update({
      where: { id: transferId },
      data,
    });

    this.transferEvents.broadcastProgress(transferId, {
      status,
      transferredBytes: Number(updated.transferredBytes),
      totalBytes: Number(updated.totalBytes),
      transferredFiles: updated.transferredFiles,
      totalFiles: updated.totalFiles,
      speed: updated.currentSpeed || '—',
      eta: updated.eta || '—',
    });

    if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
      await this.transfersService.processNextQueuedTransfer();
    }
  }

  private async logTransfer(transferId: string, level: 'INFO' | 'WARN' | 'ERROR', message: string) {
    await this.prisma.transferLog.create({
      data: {
        transferId,
        level,
        message,
      },
    });
  }

  private formatSpeed(bytesPerSecond: number): string {
    if (!bytesPerSecond) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let unitIndex = 0;
    let speed = bytesPerSecond;
    while (speed >= 1024 && unitIndex < units.length - 1) {
      speed /= 1024;
      unitIndex++;
    }
    return `${speed.toFixed(1)} ${units[unitIndex]}`;
  }

  private formatEta(seconds: number): string {
    if (!seconds || seconds < 0) return 'calculating...';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
