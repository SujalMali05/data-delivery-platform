import { Module } from '@nestjs/common';
import { BatchOperationsController } from './batch-operations.controller';
import { BatchOperationsService } from './batch-operations.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RcloneModule } from '../rclone/rclone.module';
import { AwsModule } from '../aws/aws.module';
import { TransfersModule } from '../transfers/transfers.module';

@Module({
  imports: [PrismaModule, RcloneModule, AwsModule, TransfersModule],
  controllers: [BatchOperationsController],
  providers: [BatchOperationsService],
})
export class BatchOperationsModule {}
