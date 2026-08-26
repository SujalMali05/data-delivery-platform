import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean } from 'class-validator';

// --- Deletion DTOs ---

export class RunBatchDeleteDto {
  @IsString()
  @IsNotEmpty()
  storageType: 'GDrive' | 'S3';

  @IsString()
  @IsNotEmpty()
  storageId: string;

  @IsString()
  @IsOptional()
  path?: string;

  @IsString()
  @IsOptional()
  csvContent?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  paths?: string[];
}

export class AnalyzeBatchDeleteDto {
  @IsString()
  @IsNotEmpty()
  storageType: 'GDrive' | 'S3';

  @IsString()
  @IsNotEmpty()
  storageId: string;

  @IsString()
  @IsOptional()
  path?: string;

  @IsString()
  @IsNotEmpty()
  csvContent: string;

  @IsOptional()
  @IsBoolean()
  ignoreExtension?: boolean;
}

// --- Copy DTOs ---

export class RunBatchCopyDto {
  @IsString()
  @IsNotEmpty()
  sourceType: 'GDrive' | 'S3';

  @IsString()
  @IsNotEmpty()
  sourceId: string;

  @IsString()
  @IsOptional()
  sourcePath?: string;

  @IsString()
  @IsNotEmpty()
  destType: 'GDrive' | 'S3';

  @IsString()
  @IsNotEmpty()
  destId: string;

  @IsString()
  @IsOptional()
  destinationPath?: string;

  @IsString()
  @IsOptional()
  csvContent?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  paths?: string[];
}

export class AnalyzeBatchCopyDto {
  @IsString()
  @IsNotEmpty()
  sourceType: 'GDrive' | 'S3';

  @IsString()
  @IsNotEmpty()
  sourceId: string;

  @IsString()
  @IsOptional()
  sourcePath?: string;

  @IsString()
  @IsNotEmpty()
  csvContent: string;

  @IsOptional()
  @IsBoolean()
  ignoreExtension?: boolean;
}

// --- All Objects Copy DTOs ---

export class AnalyzeBatchCopyAllObjectsDto {
  @IsString()
  @IsNotEmpty()
  sourceType: 'GDrive' | 'S3';

  @IsString()
  @IsNotEmpty()
  sourceId: string;

  @IsString()
  @IsOptional()
  sourcePath?: string;
}

// --- Sync Copy DTOs ---

export class AnalyzeBatchCopySyncDto {
  @IsString()
  @IsNotEmpty()
  sourceType: 'GDrive' | 'S3';

  @IsString()
  @IsNotEmpty()
  sourceId: string;

  @IsString()
  @IsOptional()
  sourcePath?: string;

  @IsString()
  @IsNotEmpty()
  destType: 'GDrive' | 'S3';

  @IsString()
  @IsNotEmpty()
  destId: string;

  @IsString()
  @IsOptional()
  destinationPath?: string;

  @IsOptional()
  @IsBoolean()
  ignoreExtension?: boolean;
}

export class RunBatchCopySyncDto {
  @IsString()
  @IsNotEmpty()
  sourceType: 'GDrive' | 'S3';

  @IsString()
  @IsNotEmpty()
  sourceId: string;

  @IsString()
  @IsOptional()
  sourcePath?: string;

  @IsString()
  @IsNotEmpty()
  destType: 'GDrive' | 'S3';

  @IsString()
  @IsNotEmpty()
  destId: string;

  @IsString()
  @IsOptional()
  destinationPath?: string;

  @IsArray()
  @IsString({ each: true })
  toCopy: string[];

  @IsArray()
  @IsString({ each: true })
  toDelete: string[];
}

