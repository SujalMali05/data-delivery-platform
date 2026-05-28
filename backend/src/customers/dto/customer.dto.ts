import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Matches(/^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/, {
    message: 'Invalid IAM Role ARN format',
  })
  roleArn: string;

  @IsString()
  @IsNotEmpty()
  bucketName: string;

  @IsString()
  @IsNotEmpty()
  region: string;

  @IsString()
  @IsOptional()
  prefixPath?: string;

  @IsString()
  @IsOptional()
  externalId?: string;
}

export class UpdateCustomerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @Matches(/^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/, {
    message: 'Invalid IAM Role ARN format',
  })
  roleArn?: string;

  @IsString()
  @IsOptional()
  bucketName?: string;

  @IsString()
  @IsOptional()
  region?: string;

  @IsString()
  @IsOptional()
  prefixPath?: string;

  @IsString()
  @IsOptional()
  externalId?: string;
}
