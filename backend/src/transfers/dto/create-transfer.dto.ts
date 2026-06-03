import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { TransferDirection } from '@prisma/client';

export class CreateTransferDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  sourceId: string;

  @IsString()
  @IsNotEmpty()
  customerId: string;

  @IsString()
  @IsNotEmpty()
  destinationPath: string;

  @IsEnum(['COPY', 'SYNC', 'MOVE'])
  @IsOptional()
  mode?: 'COPY' | 'SYNC' | 'MOVE';

  @IsEnum(TransferDirection)
  @IsOptional()
  direction?: TransferDirection;

  @IsInt()
  @Min(1)
  @Max(128)
  @IsOptional()
  concurrency?: number;

  @IsInt()
  @Min(1)
  @Max(128)
  @IsOptional()
  checkers?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  retries?: number;

  @IsString()
  @IsOptional()
  bandwidthLimit?: string;

  @IsBoolean()
  @IsOptional()
  skipDeletion?: boolean;

  @IsString()
  @IsOptional()
  scheduledAt?: string;

  @IsEnum(['ONE_TIME', 'DAILY', 'WEEKLY'])
  @IsOptional()
  scheduleType?: 'ONE_TIME' | 'DAILY' | 'WEEKLY';

  @IsString()
  @IsOptional()
  cronExpression?: string;

  @IsEnum(['CREATE', 'START', 'QUEUE'])
  @IsOptional()
  launchMode?: 'CREATE' | 'START' | 'QUEUE';

  @IsOptional()
  dryRunReport?: any;
}
