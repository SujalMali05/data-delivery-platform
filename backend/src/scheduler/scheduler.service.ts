import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TRANSFER_QUEUE, TRANSFER_JOB } from '../queue/constants';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('SchedulerService');

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TRANSFER_QUEUE) private readonly transferQueue: Queue,
  ) {}

  private async addToQueueSafe(transferId: string) {
    const activeJobs = await this.transferQueue.getJobs([
      'waiting',
      'active',
      'delayed',
    ]);
    const isAlreadyQueued = activeJobs.some(
      (job) => job.data?.transferId === transferId,
    );

    if (isAlreadyQueued) {
      this.logger.log(
        `Transfer ${transferId} is already in wait/active queue. Skipping duplicate enqueue.`,
      );
      return;
    }

    await this.transferQueue.add(TRANSFER_JOB, { transferId });
    this.logger.log(
      `Transfer ${transferId} added to execution queue from scheduler.`,
    );
  }

  /**
   * Check for scheduled transfers every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkScheduledTransfers() {
    const now = new Date();

    // Find one-time scheduled transfers that are due
    const dueTransfers = await this.prisma.transfer.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
        scheduleType: 'ONE_TIME',
      },
    });

    for (const transfer of dueTransfers) {
      this.logger.log(`Triggering scheduled transfer: ${transfer.name}`);

      await this.prisma.transfer.update({
        where: { id: transfer.id },
        data: { status: 'QUEUED' },
      });

      await this.addToQueueSafe(transfer.id);
    }

    if (dueTransfers.length > 0) {
      this.logger.log(`Triggered ${dueTransfers.length} scheduled transfers`);
    }
  }

  /**
   * Clean up old progress snapshots (older than 30 days)
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldSnapshots() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.progressSnapshot.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} old progress snapshots`);
    }
  }
}
