import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { WavCalculationService } from './wav-calculation.service';
import { CreateWavCalculationDto } from './dto/wav-calculation.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('wav-calculations')
@UseGuards(JwtAuthGuard)
export class WavCalculationController {
  constructor(private readonly wavCalculationService: WavCalculationService) {}

  @Post()
  create(@Body() dto: CreateWavCalculationDto) {
    return this.wavCalculationService.create(dto);
  }

  @Get()
  findAll() {
    return this.wavCalculationService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.wavCalculationService.findOne(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.wavCalculationService.delete(id);
  }
}
