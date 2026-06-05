import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
  IsOptional,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WavFileDetailDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  path: string;

  @IsNumber()
  size: number;

  @IsNumber()
  duration: number;
}

export class CreateWavCalculationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  storageType: string;

  @IsString()
  targetPath: string;

  @IsString()
  @IsNotEmpty()
  sourceName: string;

  @IsNumber()
  @IsOptional()
  totalDuration?: number;

  @IsNumber()
  @IsOptional()
  wavCount?: number;

  @IsNumber()
  @IsOptional()
  skippedCount?: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => WavFileDetailDto)
  files?: WavFileDetailDto[];

  @IsObject()
  @IsOptional()
  parameters?: Record<string, any>;
}
