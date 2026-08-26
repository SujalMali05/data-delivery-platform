import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RcloneService } from '../rclone/rclone.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TRANSFER_QUEUE, TRANSFER_JOB } from '../queue/constants';

@Injectable()
export class TransfersService implements OnApplicationBootstrap {
  private readonly logger = new Logger('TransfersService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rcloneService: RcloneService,
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
    this.logger.log(`Transfer ${transferId} added to execution queue.`);
  }

  async onApplicationBootstrap() {
    this.logger.log('Initializing queue session on application bootstrap...');
    try {
      // 1. Find all RUNNING transfers
      const runningTransfers = await this.prisma.transfer.findMany({
        where: { status: 'RUNNING' },
      });

      for (const transfer of runningTransfers) {
        const activeJobId = await this.rcloneService.getActiveJobId(
          transfer.id,
        );

        if (activeJobId) {
          this.logger.log(
            `Found active background rclone job ${activeJobId} for RUNNING transfer ${transfer.id}. Re-queueing monitoring job...`,
          );
          await this.prisma.transferLog.create({
            data: {
              transferId: transfer.id,
              level: 'INFO',
              message: `System restarted. Reconnected to active background rclone job (jobId: ${activeJobId}).`,
            },
          });
          // Re-add to BullMQ queue so the worker resumes monitoring it
          await this.addToQueueSafe(transfer.id);
        } else {
          this.logger.log(
            `Transfer ${transfer.id} is marked RUNNING but no active background rclone job was found. Resetting to QUEUED...`,
          );
          await this.prisma.transfer.update({
            where: { id: transfer.id },
            data: { status: 'QUEUED' },
          });
          await this.prisma.transferLog.create({
            data: {
              transferId: transfer.id,
              level: 'WARN',
              message:
                'Transfer execution interrupted and no active background job found. Reset to QUEUED.',
            },
          });
        }
      }

      // 2. Trigger the sequential queue processor
      await this.processNextQueuedTransfer();
    } catch (err: any) {
      this.logger.error(
        `Failed to initialize queue session on startup: ${err.message}`,
      );
    }
  }

  async findAll(filters?: {
    status?: string;
    direction?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { isBatch: false };
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.direction) {
      where.direction = filters.direction;
    }

    const [transfers, total, totalPush, totalPull] = await Promise.all([
      this.prisma.transfer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { id: true, name: true, bucketName: true },
          },
          source: {
            select: { id: true, name: true, drivePath: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      this.prisma.transfer.count({ where }),
      this.prisma.transfer.count({ where: { direction: 'PUSH' } }),
      this.prisma.transfer.count({ where: { direction: 'PULL' } }),
    ]);

    return {
      data: transfers.map((t) => ({
        ...t,
        totalBytes: t.totalBytes.toString(),
        transferredBytes: t.transferredBytes.toString(),
      })),
      total,
      totalPush,
      totalPull,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        customer: true,
        source: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    return {
      ...transfer,
      totalBytes: transfer.totalBytes.toString(),
      transferredBytes: transfer.transferredBytes.toString(),
    };
  }

  async create(dto: CreateTransferDto, userId: string) {
    const launchMode = dto.launchMode || 'START';
    let status: 'PAUSED' | 'QUEUED' | 'SCHEDULED' = 'PAUSED';

    if (dto.scheduledAt) {
      status = 'SCHEDULED';
    } else if (launchMode === 'START' || launchMode === 'QUEUE') {
      status = 'QUEUED';
    }

    // Fetch source and customer details for snapshotting
    const source = await this.prisma.googleDriveSource.findUnique({
      where: { id: dto.sourceId },
      select: { name: true, drivePath: true },
    });
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      select: { name: true, bucketName: true },
    });

    const transfer = await this.prisma.transfer.create({
      data: {
        name: dto.name,
        direction: dto.direction || 'PUSH',
        sourceId: dto.sourceId,
        sourceName: source?.name || null,
        sourcePath: source?.drivePath || null,
        customerId: dto.customerId,
        customerName: customer?.name || null,
        customerBucket: customer?.bucketName || null,
        destinationPath: dto.destinationPath,
        mode: dto.mode || 'COPY',
        concurrency: dto.concurrency || 6,
        checkers: dto.checkers || 32,
        retries: dto.retries || 50,
        bandwidthLimit: dto.bandwidthLimit,
        skipDeletion: dto.skipDeletion || false,
        dryRunReport: dto.dryRunReport || null,
        selectedItems: dto.selectedItems || undefined,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        scheduleType: dto.scheduleType,
        cronExpression: dto.cronExpression,
        status,
        createdById: userId,
      },
      include: {
        customer: { select: { name: true, bucketName: true } },
        source: { select: { name: true, drivePath: true } },
      },
    });

    this.logger.log(
      `Transfer created: ${transfer.name} (${transfer.id}) with launchMode: ${launchMode}`,
    );

    // If not scheduled, handle launch mode
    if (!dto.scheduledAt) {
      if (launchMode === 'START') {
        await this.addToQueueSafe(transfer.id);
        this.logger.log(`Transfer started immediately: ${transfer.id}`);
      } else if (launchMode === 'QUEUE') {
        await this.processNextQueuedTransfer();
      } else {
        this.logger.log(`Transfer created only (paused/idle): ${transfer.id}`);
      }
    }

    return {
      ...transfer,
      totalBytes: transfer.totalBytes.toString(),
      transferredBytes: transfer.transferredBytes.toString(),
    };
  }

  async startTransfer(id: string) {
    const transfer = await this.findById(id);

    if (
      !['QUEUED', 'PAUSED', 'FAILED', 'SCHEDULED'].includes(transfer.status)
    ) {
      throw new Error(`Cannot start transfer in status: ${transfer.status}`);
    }

    await this.prisma.transfer.update({
      where: { id },
      data: { status: 'QUEUED' },
    });

    await this.addToQueueSafe(id);
    this.logger.log(`Transfer started/resumed immediately: ${id}`);

    return { success: true, message: 'Transfer started immediately' };
  }

  async queueTransfer(id: string) {
    const transfer = await this.findById(id);

    if (
      !['QUEUED', 'PAUSED', 'FAILED', 'SCHEDULED'].includes(transfer.status)
    ) {
      throw new Error(`Cannot queue transfer in status: ${transfer.status}`);
    }

    await this.prisma.transfer.update({
      where: { id },
      data: { status: 'QUEUED' },
    });

    this.logger.log(`Transfer ${id} added to sequential queue.`);
    await this.processNextQueuedTransfer();

    return { success: true, message: 'Transfer added to queue' };
  }

  async processNextQueuedTransfer() {
    this.logger.log('Checking for next sequentially queued transfer...');
    try {
      // 1. Check if there are any transfers currently RUNNING
      const running = await this.prisma.transfer.findFirst({
        where: { status: 'RUNNING' },
      });

      if (running) {
        this.logger.log(
          `A transfer is already running: ${running.id}. Next queued transfer will wait.`,
        );
        return;
      }

      // 2. Find the oldest QUEUED transfer
      const nextTransfer = await this.prisma.transfer.findFirst({
        where: { status: 'QUEUED' },
        orderBy: { createdAt: 'asc' },
      });

      if (nextTransfer) {
        await this.addToQueueSafe(nextTransfer.id);
      } else {
        this.logger.log('No queued transfers found.');
      }
    } catch (err: any) {
      this.logger.error(`Error in processNextQueuedTransfer: ${err.message}`);
    }
  }

  async pauseTransfer(id: string) {
    const transfer = await this.findById(id);

    if (transfer.status !== 'RUNNING') {
      throw new Error('Can only pause a running transfer');
    }

    if (transfer.rcloneJobId) {
      await this.rcloneService.stopJob(transfer.rcloneJobId);
    }

    await this.prisma.transfer.update({
      where: { id },
      data: { status: 'PAUSED' },
    });

    this.logger.log(`Transfer paused: ${id}`);
    return { success: true, message: 'Transfer paused' };
  }

  async stopTransfer(id: string) {
    const transfer = await this.findById(id);

    if (!['RUNNING', 'PAUSED', 'QUEUED'].includes(transfer.status)) {
      throw new Error(`Cannot stop transfer in status: ${transfer.status}`);
    }

    if (transfer.rcloneJobId) {
      await this.rcloneService.stopJob(transfer.rcloneJobId);
    }

    await this.prisma.transfer.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    this.logger.log(`Transfer stopped: ${id}`);
    return { success: true, message: 'Transfer cancelled' };
  }

  async retryTransfer(id: string) {
    const transfer = await this.findById(id);

    if (transfer.status !== 'FAILED') {
      throw new Error('Can only retry a failed transfer');
    }

    // Reset progress
    await this.prisma.transfer.update({
      where: { id },
      data: {
        status: 'QUEUED',
        errorCount: 0,
        rcloneJobId: null,
        rcloneGroup: null,
        startedAt: null,
        completedAt: null,
      },
    });

    await this.addToQueueSafe(id);
    this.logger.log(`Transfer retry queued: ${id}`);

    return { success: true, message: 'Transfer queued for retry' };
  }

  async deleteTransfer(id: string) {
    const transfer = await this.findById(id);

    // Stop if active
    if (['RUNNING', 'QUEUED', 'PAUSED'].includes(transfer.status)) {
      try {
        if (transfer.rcloneJobId) {
          await this.rcloneService.stopJob(transfer.rcloneJobId);
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to stop job ${transfer.rcloneJobId} during deletion: ${err.message}`,
        );
      }
    }

    // Delete record (cascade handles snapshots and logs)
    await this.prisma.transfer.delete({
      where: { id },
    });

    this.logger.log(`Transfer deleted: ${id}`);
    return { success: true, message: 'Transfer deleted successfully' };
  }

  async getSnapshots(id: string, limit: number = 100) {
    const snapshots = await this.prisma.progressSnapshot.findMany({
      where: { transferId: id },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return snapshots.map((s) => ({
      ...s,
      bytesTransferred: s.bytesTransferred.toString(),
    }));
  }
}
