import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SchedulerService } from './scheduler.service';
import { TRANSFER_QUEUE } from '../queue/constants';

@Module({
  imports: [BullModule.registerQueue({ name: TRANSFER_QUEUE })],
  providers: [SchedulerService],
})
export class SchedulerModule {}
