import { Module } from '@nestjs/common';
import { StsService } from './sts.service';
import { S3ValidatorService } from './s3-validator.service';

@Module({
  providers: [StsService, S3ValidatorService],
  exports: [StsService, S3ValidatorService],
})
export class AwsModule {}
