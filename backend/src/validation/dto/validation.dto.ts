import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateValidationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  sourceType: string; // 'GDrive' | 'S3'

  @IsString()
  @IsNotEmpty()
  sourceId: string;

  @IsString()
  @IsOptional()
  sourcePath?: string;

  @IsString()
  @IsNotEmpty()
  destType: string; // 'GDrive' | 'S3'

  @IsString()
  @IsNotEmpty()
  destId: string;

  @IsString()
  @IsOptional()
  destinationPath?: string;

  @IsBoolean()
  @IsOptional()
  oneWay?: boolean;

  @IsBoolean()
  @IsOptional()
  ignoreExtension?: boolean;
}
