import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ValidationService } from './validation.service';
import { ValidationController } from './validation.controller';
import { VALIDATION_QUEUE } from '../queue/constants';

@Module({
  imports: [BullModule.registerQueue({ name: VALIDATION_QUEUE })],
  controllers: [ValidationController],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
