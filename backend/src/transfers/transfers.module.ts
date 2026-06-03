import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { TransferEventsService } from './transfer-events.service';
import { DryRunService } from './dry-run.service';
import { RcloneModule } from '../rclone/rclone.module';
import { AwsModule } from '../aws/aws.module';
import { TRANSFER_QUEUE } from '../queue/constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: TRANSFER_QUEUE }),
    RcloneModule,
    AwsModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService, TransferEventsService, DryRunService],
  exports: [TransfersService, TransferEventsService],
})
export class TransfersModule {}
