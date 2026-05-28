import { Module } from '@nestjs/common';
import { GdriveService } from './gdrive.service';
import { GdriveController } from './gdrive.controller';
import { RcloneModule } from '../rclone/rclone.module';

@Module({
  imports: [RcloneModule],
  controllers: [GdriveController],
  providers: [GdriveService],
  exports: [GdriveService],
})
export class GdriveModule {}
