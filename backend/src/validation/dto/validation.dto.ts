import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateValidationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  sourceId: string;

  @IsString()
  @IsOptional()
  sourcePath?: string;

  @IsString()
  @IsNotEmpty()
  customerId: string;

  @IsString()
  @IsOptional()
  destinationPath?: string;

  @IsBoolean()
  @IsOptional()
  oneWay?: boolean;
}
