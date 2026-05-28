import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Sse,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TransfersService } from './transfers.service';
import { TransferEventsService } from './transfer-events.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('transfers')
@UseGuards(JwtAuthGuard)
export class TransfersController {
  constructor(
    private readonly transfersService: TransfersService,
    private readonly transferEvents: TransferEventsService,
  ) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.transfersService.findAll({ status, page, limit });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.transfersService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateTransferDto, @Request() req: any) {
    return this.transfersService.create(dto, req.user.id);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.transfersService.startTransfer(id);
  }

  @Post(':id/queue')
  queue(@Param('id') id: string) {
    return this.transfersService.queueTransfer(id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.transfersService.pauseTransfer(id);
  }

  @Post(':id/stop')
  stop(@Param('id') id: string) {
    return this.transfersService.stopTransfer(id);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.transfersService.retryTransfer(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.transfersService.deleteTransfer(id);
  }

  /**
   * SSE endpoint for live progress streaming
   */
  @Sse(':id/progress')
  streamProgress(@Param('id') id: string): Observable<MessageEvent> {
    return this.transferEvents.getProgressStream(id);
  }

  /**
   * SSE endpoint for all transfers (dashboard overview)
   */
  @Sse('stream/all')
  streamAll(): Observable<MessageEvent> {
    return this.transferEvents.getAllProgressStream();
  }

  @Get(':id/snapshots')
  getSnapshots(
    @Param('id') id: string,
    @Query('limit') limit?: number,
  ) {
    return this.transfersService.getSnapshots(id, limit);
  }
}
