import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { VALIDATION_QUEUE, VALIDATION_JOB } from '../queue/constants';
import { CreateValidationDto } from './dto/validation.dto';
import { existsSync, readFileSync, unlinkSync } from 'fs';

@Injectable()
export class ValidationService {
  private readonly logger = new Logger('ValidationService');

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(VALIDATION_QUEUE) private readonly validationQueue: Queue,
  ) {}

  async create(dto: CreateValidationDto) {
    this.logger.log(`Creating validation task in DB: ${dto.name}`);

    const validation = await this.prisma.validation.create({
      data: {
        name: dto.name,
        sourceId: dto.sourceId,
        sourcePath: dto.sourcePath || '',
        customerId: dto.customerId,
        destinationPath: dto.destinationPath || '',
        oneWay: dto.oneWay ?? false,
        status: 'PENDING',
      },
    });

    // Enqueue the validation job in BullMQ
    await this.validationQueue.add(
      VALIDATION_JOB,
      { validationId: validation.id },
      { jobId: validation.id },
    );

    this.logger.log(`Validation job enqueued to BullMQ: ${validation.id}`);
    return validation;
  }

  async findAll() {
    return this.prisma.validation.findMany({
      include: {
        source: {
          select: { name: true, drivePath: true },
        },
        customer: {
          select: { name: true, bucketName: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findById(id: string) {
    const validation = await this.prisma.validation.findUnique({
      where: { id },
      include: {
        source: true,
        customer: true,
      },
    });

    if (!validation) {
      throw new NotFoundException(`Validation record not found: ${id}`);
    }

    return validation;
  }

  async findReport(id: string) {
    const validation = await this.findById(id);

    if (!validation.reportPath) {
      throw new NotFoundException(`Report path not recorded for validation: ${id}`);
    }

    if (!existsSync(validation.reportPath)) {
      throw new NotFoundException(`Detailed JSON report file not found on disk at: ${validation.reportPath}`);
    }

    try {
      const rawData = readFileSync(validation.reportPath, 'utf8');
      return JSON.parse(rawData);
    } catch (err: any) {
      this.logger.error(`Failed to read or parse validation report: ${err.message}`);
      throw new Error(`Failed to load detailed report: ${err.message}`);
    }
  }

  async delete(id: string) {
    const validation = await this.findById(id);

    // Delete JSON report from disk
    if (validation.reportPath && existsSync(validation.reportPath)) {
      try {
        unlinkSync(validation.reportPath);
        this.logger.log(`Deleted validation report file: ${validation.reportPath}`);
      } catch (err: any) {
        this.logger.warn(`Failed to delete validation report file from disk: ${err.message}`);
      }
    }

    // Delete DB record
    await this.prisma.validation.delete({
      where: { id },
    });

    this.logger.log(`Deleted validation record from database: ${id}`);
    return { success: true, message: 'Validation deleted successfully' };
  }
}
