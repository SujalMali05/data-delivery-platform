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

  private async resolveNextValidationName(
    requestedName: string,
  ): Promise<string> {
    // 1. Parse name to see if it already ends in -V\d+
    const versionMatch = requestedName.match(/(.+)[_-][Vv](\d+)$/);
    let baseName = requestedName;

    if (versionMatch) {
      baseName = versionMatch[1].trim();
    }

    // 2. Fetch all validation records whose names start with baseName
    const existing = await this.prisma.validation.findMany({
      where: {
        name: {
          startsWith: baseName,
        },
      },
      select: {
        name: true,
      },
    });

    if (existing.length === 0) {
      // No existing validations with this base name, we can use the requestedName directly
      return requestedName;
    }

    // 3. Escape baseName for regex
    const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedBase}(?:[_-][Vv](\\d+))?$`, 'i');

    let maxVersion = 0;
    let hasExactMatch = false;

    for (const record of existing) {
      const match = record.name.match(regex);
      if (match) {
        if (record.name.toLowerCase() === requestedName.toLowerCase()) {
          hasExactMatch = true;
        }
        if (match[1]) {
          const ver = parseInt(match[1], 10);
          if (ver > maxVersion) {
            maxVersion = ver;
          }
        }
      }
    }

    // 4. Decide name based on match status and max version
    if (!hasExactMatch) {
      // If the exact requested name is not in use, use it
      return requestedName;
    }

    // If it is in use, we must append/increment version
    // If the maximum version is 0 (meaning we only found baseName without suffix), the next version is 1
    const nextVersion = maxVersion > 0 ? maxVersion + 1 : 1;
    return `${baseName}-V${nextVersion}`;
  }

  async create(dto: CreateValidationDto) {
    const finalName = await this.resolveNextValidationName(dto.name);
    this.logger.log(
      `Resolved validation name: "${dto.name}" -> "${finalName}"`,
    );

    const validation = await this.prisma.validation.create({
      data: {
        name: finalName,
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
      throw new NotFoundException(
        `Report path not recorded for validation: ${id}`,
      );
    }

    if (!existsSync(validation.reportPath)) {
      throw new NotFoundException(
        `Detailed JSON report file not found on disk at: ${validation.reportPath}`,
      );
    }

    try {
      const rawData = readFileSync(validation.reportPath, 'utf8');
      return JSON.parse(rawData);
    } catch (err: any) {
      this.logger.error(
        `Failed to read or parse validation report: ${err.message}`,
      );
      throw new Error(`Failed to load detailed report: ${err.message}`);
    }
  }

  async delete(id: string) {
    const validation = await this.findById(id);

    // Delete JSON report from disk
    if (validation.reportPath && existsSync(validation.reportPath)) {
      try {
        unlinkSync(validation.reportPath);
        this.logger.log(
          `Deleted validation report file: ${validation.reportPath}`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Failed to delete validation report file from disk: ${err.message}`,
        );
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
