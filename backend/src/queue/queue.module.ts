import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TransferProcessor } from './transfer.processor';
import { RcloneModule } from '../rclone/rclone.module';
import { AwsModule } from '../aws/aws.module';
import { TransfersModule } from '../transfers/transfers.module';
import {
  TRANSFER_QUEUE,
  NOTIFICATION_QUEUE,
  SCHEDULED_TRANSFER_QUEUE,
} from './constants';

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: TRANSFER_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 200 },
        },
      },
      {
        name: NOTIFICATION_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 100 },
        },
      },
      {
        name: SCHEDULED_TRANSFER_QUEUE,
        defaultJobOptions: {
          attempts: 2,
          removeOnComplete: { count: 50 },
        },
      },
    ),
    RcloneModule,
    AwsModule,
    TransfersModule,
  ],
  providers: [TransferProcessor],
})
export class QueueModule {}
