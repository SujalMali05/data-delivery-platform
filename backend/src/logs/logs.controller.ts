import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { LogsService } from './logs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('logs')
@UseGuards(JwtAuthGuard)
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  findAll(
    @Query('transferId') transferId?: string,
    @Query('level') level?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.logsService.findAll({ transferId, level, search, page, limit });
  }

  @Get('transfer/:transferId')
  findByTransfer(
    @Param('transferId') transferId: string,
    @Query('limit') limit?: number,
  ) {
    return this.logsService.findByTransfer(transferId, limit);
  }

  @Get('transfer/:transferId/download')
  async downloadLogs(
    @Param('transferId') transferId: string,
    @Res() res: Response,
  ) {
    const content = await this.logsService.downloadLogs(transferId);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="transfer-${transferId}-logs.txt"`,
    );
    res.send(content);
  }
}
