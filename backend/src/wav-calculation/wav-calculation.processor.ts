import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { GdriveService } from '../gdrive/gdrive.service';
import { CustomersService } from '../customers/customers.service';
import { WAV_CALCULATION_QUEUE } from '../queue/constants';

export interface WavCalculationJobData {
  calculationId: string;
}

interface WavCalculationResult {
  totalDuration: number;
  wavCount: number;
  files: Array<{
    name: string;
    path: string;
    size: number;
    duration: number;
  }>;
  skippedCount: number;
}

interface WavCalculationParams {
  path?: string;
  sharedDriveId?: string;
  authType?: 'SERVICE_ACCOUNT' | 'OAUTH';
  roleArn?: string;
  bucketName?: string;
  region?: string;
  externalId?: string | null;
}

@Processor(WAV_CALCULATION_QUEUE, {
  concurrency: 1, // Run 1 calculation at a time to prevent Google Drive / S3 API exhaustion
  lockDuration: 600000, // 10 minutes lock duration
})
export class WavCalculationProcessor extends WorkerHost {
  private readonly logger = new Logger('WavCalculationProcessor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly gdriveService: GdriveService,
    private readonly customersService: CustomersService,
  ) {
    super();
  }

  async process(job: Job<WavCalculationJobData>): Promise<void> {
    const { calculationId } = job.data;
    this.logger.log(
      `🚀 Processing WAV duration calculation job: ${calculationId}`,
    );

    try {
      // 1. Fetch the calculation details
      const record = await this.prisma.wavCalculation.findUnique({
        where: { id: calculationId },
      });

      if (!record) {
        throw new Error(`Calculation record not found: ${calculationId}`);
      }

      // Update status to RUNNING
      await this.prisma.wavCalculation.update({
        where: { id: calculationId },
        data: {
          status: 'RUNNING',
        },
      });

      const params =
        (record.parameters as unknown as WavCalculationParams) || {};
      let result: WavCalculationResult;

      // Throttle DB updates to at most once per second
      let lastUpdateTime = 0;
      const onProgress = (progress: {
        scanned: number;
        total: number;
        currentFile: string;
      }) => {
        const now = Date.now();
        if (
          now - lastUpdateTime >= 1000 ||
          progress.scanned === progress.total
        ) {
          lastUpdateTime = now;
          this.prisma.wavCalculation
            .update({
              where: { id: calculationId },
              data: {
                progressScanned: progress.scanned,
                progressTotal: progress.total,
                currentFile: progress.currentFile,
              },
            })
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              this.logger.error(
                `Failed to update calculation progress in DB: ${msg}`,
              );
            });
        }
      };

      // 2. Delegate to correct service based on storageType
      if (record.storageType === 'GDrive') {
        result = await this.gdriveService.calculateWavDuration(
          params.path || '',
          params.sharedDriveId,
          params.authType || 'SERVICE_ACCOUNT',
          onProgress,
        );
      } else if (record.storageType === 'GDriveCompare') {
        const audioLink = (record.parameters as any)?.audioFolderLink || '';
        const transcriptLink = (record.parameters as any)?.transcriptFolderLink || '';
        result = await this.gdriveService.calculateWavDurationCompare(
          audioLink,
          transcriptLink,
          params.sharedDriveId,
          params.authType || 'SERVICE_ACCOUNT',
          onProgress,
        );
      } else if (record.storageType === 'S3') {
        if (!params.roleArn || !params.bucketName || !params.region) {
          throw new Error(
            'Missing required S3 storage credentials in parameters.',
          );
        }
        result = await this.customersService.calculateWavDuration(
          params.roleArn,
          params.bucketName,
          params.region,
          params.externalId || null,
          params.path || '',
          onProgress,
        );
      } else {
        throw new Error(`Unsupported storage type: ${record.storageType}`);
      }

      // 3. Mark the calculation as COMPLETED with results
      await this.prisma.wavCalculation.update({
        where: { id: calculationId },
        data: {
          status: 'COMPLETED',
          totalDuration: result.totalDuration,
          wavCount: result.wavCount,
          skippedCount: result.skippedCount,
          files: result.files,
          currentFile: '', // Clear current file on completion
        },
      });

      this.logger.log(
        `✅ WAV calculation job completed successfully: ${calculationId}`,
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `❌ WAV calculation job failed for ${calculationId}: ${errorMessage}`,
      );

      try {
        await this.prisma.wavCalculation.update({
          where: { id: calculationId },
          data: {
            status: 'FAILED',
            errorMessage: errorMessage,
            currentFile: '',
          },
        });
      } catch (dbUpdateErr: unknown) {
        const dbErrorMsg =
          dbUpdateErr instanceof Error
            ? dbUpdateErr.message
            : String(dbUpdateErr);
        this.logger.error(
          `Failed to record WAV calculation job failure in DB: ${dbErrorMsg}`,
        );
      }
    }
  }
}
