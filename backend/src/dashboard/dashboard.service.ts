import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger('DashboardService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get overview metrics for the dashboard
   */
  async getOverview() {
    const [
      runningCount,
      queuedCount,
      failedCount,
      completedCount,
      totalTransferred,
      recentTransfers,
    ] = await Promise.all([
      this.prisma.transfer.count({ where: { status: 'RUNNING' } }),
      this.prisma.transfer.count({ where: { status: 'QUEUED' } }),
      this.prisma.transfer.count({ where: { status: 'FAILED' } }),
      this.prisma.transfer.count({ where: { status: 'COMPLETED' } }),
      this.prisma.transfer.aggregate({
        _sum: { transferredBytes: true },
      }),
      this.prisma.transfer.findMany({
        take: 10,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          status: true,
          transferredBytes: true,
          totalBytes: true,
          currentSpeed: true,
          eta: true,
          transferredFiles: true,
          totalFiles: true,
          errorCount: true,
          startedAt: true,
          completedAt: true,
          updatedAt: true,
          customer: {
            select: { name: true },
          },
        },
      }),
    ]);

    return {
      metrics: {
        running: runningCount,
        queued: queuedCount,
        failed: failedCount,
        completed: completedCount,
        totalTransferred: (
          totalTransferred._sum.transferredBytes || BigInt(0)
        ).toString(),
      },
      recentTransfers: recentTransfers.map((t) => ({
        ...t,
        transferredBytes: t.transferredBytes.toString(),
        totalBytes: t.totalBytes.toString(),
      })),
    };
  }

  /**
   * Get throughput data for charts (last 24 hours)
   */
  async getThroughput() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const snapshots = await this.prisma.progressSnapshot.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
      select: {
        speed: true,
        bytesTransferred: true,
        timestamp: true,
        transfer: {
          select: { name: true },
        },
      },
    });

    return snapshots.map((s) => ({
      ...s,
      bytesTransferred: s.bytesTransferred.toString(),
    }));
  }
}
