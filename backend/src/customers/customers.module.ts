import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { AwsModule } from '../aws/aws.module';
import { RcloneModule } from '../rclone/rclone.module';

@Module({
  imports: [AwsModule, RcloneModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
