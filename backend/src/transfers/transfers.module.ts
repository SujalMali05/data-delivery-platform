import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { TransferEventsService } from './transfer-events.service';
import { RcloneModule } from '../rclone/rclone.module';
import { TRANSFER_QUEUE } from '../queue/constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: TRANSFER_QUEUE }),
    RcloneModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService, TransferEventsService],
  exports: [TransfersService, TransferEventsService],
})
export class TransfersModule {}
