import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WavCalculationService } from './wav-calculation.service';
import { WavCalculationController } from './wav-calculation.controller';
import { WavCalculationProcessor } from './wav-calculation.processor';
import { WAV_CALCULATION_QUEUE } from '../queue/constants';
import { PrismaModule } from '../prisma/prisma.module';
import { GdriveModule } from '../gdrive/gdrive.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: WAV_CALCULATION_QUEUE,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    }),
    PrismaModule,
    GdriveModule,
    CustomersModule,
  ],
  controllers: [WavCalculationController],
  providers: [WavCalculationService, WavCalculationProcessor],
})
export class WavCalculationModule {}
