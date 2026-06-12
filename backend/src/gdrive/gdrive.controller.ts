import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { GdriveService } from './gdrive.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('gdrive')
@UseGuards(JwtAuthGuard)
export class GdriveController {
  constructor(private readonly gdriveService: GdriveService) {}

  @Get('status')
  getStatus() {
    return this.gdriveService.getStatus();
  }

  @Get('sources')
  getSources() {
    return this.gdriveService.getSources();
  }

  @Get('sources/:id')
  getSourceById(@Param('id') id: string) {
    return this.gdriveService.getSourceById(id);
  }

  @Post('sources')
  createSource(
    @Body()
    body: {
      name: string;
      drivePath: string;
      driveType?: 'MY_DRIVE' | 'SHARED_DRIVE';
      sharedDriveId?: string;
      authType?: 'SERVICE_ACCOUNT' | 'OAUTH';
      direction?: 'PUSH' | 'PULL';
    },
  ) {
    return this.gdriveService.createSource(body);
  }

  @Delete('sources/:id')
  deleteSource(@Param('id') id: string) {
    return this.gdriveService.deleteSource(id);
  }

  @Post('browse')
  browse(
    @Body()
    body: {
      path?: string;
      sharedDriveId?: string;
      authType?: 'SERVICE_ACCOUNT' | 'OAUTH';
      showFiles?: boolean;
    },
  ) {
    return this.gdriveService.browsePath(
      body.path,
      body.sharedDriveId,
      body.authType,
      body.showFiles,
    );
  }

  @Post('size')
  calculateSize(
    @Body()
    body: {
      path?: string;
      sharedDriveId?: string;
      authType?: 'SERVICE_ACCOUNT' | 'OAUTH';
    },
  ) {
    return this.gdriveService.calculateSize(
      body.path,
      body.sharedDriveId,
      body.authType,
    );
  }

  @Post('dedupe')
  dedupe(
    @Body()
    body: {
      sourceId: string;
      path?: string;
      mode?: 'newest' | 'oldest' | 'rename' | 'skip';
      sharedDriveId?: string;
      authType?: 'SERVICE_ACCOUNT' | 'OAUTH';
    },
  ) {
    return this.gdriveService.dedupePath(
      body.sourceId,
      body.path,
      body.mode,
      body.sharedDriveId,
      body.authType,
    );
  }
}
