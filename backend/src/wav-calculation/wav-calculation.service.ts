import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWavCalculationDto } from './dto/wav-calculation.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WAV_CALCULATION_QUEUE, WAV_CALCULATION_JOB } from '../queue/constants';

@Injectable()
export class WavCalculationService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(WAV_CALCULATION_QUEUE)
    private readonly queue: Queue,
  ) {}

  async create(dto: CreateWavCalculationDto) {
    // 1. Create database record in PENDING state
    const record = await this.prisma.wavCalculation.create({
      data: {
        name: dto.name,
        storageType: dto.storageType,
        targetPath: dto.targetPath || '',
        sourceName: dto.sourceName,
        status: 'PENDING',
        parameters: dto.parameters || {},
      },
    });

    // 2. Add job to background queue
    await this.queue.add(WAV_CALCULATION_JOB, {
      calculationId: record.id,
    });

    return record;
  }

  async findAll() {
    return this.prisma.wavCalculation.findMany({
      select: {
        id: true,
        name: true,
        storageType: true,
        targetPath: true,
        sourceName: true,
        status: true,
        progressScanned: true,
        progressTotal: true,
        totalDuration: true,
        wavCount: true,
        skippedCount: true,
        errorMessage: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.wavCalculation.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException(`Wav calculation with ID ${id} not found`);
    }
    return record;
  }

  async delete(id: string) {
    const record = await this.prisma.wavCalculation.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException(`Wav calculation with ID ${id} not found`);
    }
    return this.prisma.wavCalculation.delete({
      where: { id },
    });
  }
}
