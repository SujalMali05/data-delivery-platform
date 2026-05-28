import { Module } from '@nestjs/common';
import { RcloneService } from './rclone.service';
import { RcloneConfigService } from './rclone-config.service';

@Module({
  providers: [RcloneService, RcloneConfigService],
  exports: [RcloneService, RcloneConfigService],
})
export class RcloneModule {}
