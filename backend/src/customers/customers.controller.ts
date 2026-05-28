import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll() {
    return this.customersService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.customersService.delete(id);
  }

  @Post(':id/validate')
  validateAccess(@Param('id') id: string) {
    return this.customersService.validateAccess(id);
  }

  @Post('browse')
  browse(
    @Body()
    body: {
      roleArn: string;
      bucketName: string;
      region: string;
      externalId?: string;
      path?: string;
    },
  ) {
    return this.customersService.browseBucket(
      body.roleArn,
      body.bucketName,
      body.region,
      body.externalId || null,
      body.path,
    );
  }

  @Post('size')
  calculateSize(
    @Body()
    body: {
      roleArn: string;
      bucketName: string;
      region: string;
      externalId?: string;
      path?: string;
    },
  ) {
    return this.customersService.calculateSize(
      body.roleArn,
      body.bucketName,
      body.region,
      body.externalId || null,
      body.path,
    );
  }
}
