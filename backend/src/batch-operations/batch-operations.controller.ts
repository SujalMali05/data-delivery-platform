import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { BatchOperationsService } from './batch-operations.service';
import {
  RunBatchDeleteDto,
  AnalyzeBatchDeleteDto,
  RunBatchCopyDto,
  AnalyzeBatchCopyDto,
  AnalyzeBatchCopyAllObjectsDto,
  AnalyzeBatchCopySyncDto,
  RunBatchCopySyncDto,
} from './dto/batch-operations.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('batch-operations')
@UseGuards(JwtAuthGuard)
export class BatchOperationsController {
  constructor(private readonly service: BatchOperationsService) {}

  @Post('delete')
  runDelete(@Body() dto: RunBatchDeleteDto, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.service.runBatchDelete(dto, userId);
  }

  @Post('delete/analyze')
  analyzeDelete(@Body() dto: AnalyzeBatchDeleteDto) {
    return this.service.analyzeBatchDelete(dto);
  }

  @Post('copy')
  runCopy(@Body() dto: RunBatchCopyDto, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.service.runBatchCopy(dto, userId);
  }

  @Post('copy/analyze')
  analyzeCopy(@Body() dto: AnalyzeBatchCopyDto) {
    return this.service.analyzeBatchCopy(dto);
  }

  @Post('copy/analyze-all')
  analyzeCopyAllObjects(@Body() dto: AnalyzeBatchCopyAllObjectsDto) {
    return this.service.analyzeBatchCopyAllObjects(dto);
  }

  @Post('copy/analyze-sync')
  analyzeCopySync(@Body() dto: AnalyzeBatchCopySyncDto) {
    return this.service.analyzeBatchCopySync(dto);
  }

  @Post('copy/sync')
  runCopySync(@Body() dto: RunBatchCopySyncDto, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.service.runBatchCopySync(dto, userId);
  }
}
