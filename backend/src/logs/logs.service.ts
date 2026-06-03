import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LogsService {
  private readonly logger = new Logger('LogsService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search and filter logs across all transfers
   */
  async findAll(filters?: {
    transferId?: string;
    level?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.transferId) where.transferId = filters.transferId;
    if (filters?.level) where.level = filters.level;
    if (filters?.search) {
      where.message = { contains: filters.search, mode: 'insensitive' };
    }

    const [logs, total] = await Promise.all([
      this.prisma.transferLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          transfer: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.transferLog.count({ where }),
    ]);

    return {
      data: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get logs for a specific transfer
   */
  async findByTransfer(transferId: string, limit: number = 100) {
    return this.prisma.transferLog.findMany({
      where: { transferId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Get logs as downloadable text
   */
  async downloadLogs(transferId: string): Promise<string> {
    const logs = await this.prisma.transferLog.findMany({
      where: { transferId },
      orderBy: { timestamp: 'asc' },
    });

    return logs
      .map(
        (log) =>
          `[${log.timestamp.toISOString()}] [${log.level}] ${log.message}`,
      )
      .join('\n');
  }
}
