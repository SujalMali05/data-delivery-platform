import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ValidationService } from './validation.service';
import { CreateValidationDto } from './dto/validation.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('validation')
@UseGuards(JwtAuthGuard)
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @Post()
  create(@Body() dto: CreateValidationDto) {
    return this.validationService.create(dto);
  }

  @Get()
  findAll() {
    return this.validationService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.validationService.findById(id);
  }

  @Get(':id/report')
  findReport(@Param('id') id: string) {
    return this.validationService.findReport(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.validationService.delete(id);
  }
}
