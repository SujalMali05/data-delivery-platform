import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { TemporaryCredentials } from './sts.service';

@Injectable()
export class S3ValidatorService {
  private readonly logger = new Logger('S3ValidatorService');

  private createS3Client(
    credentials: TemporaryCredentials,
    region: string,
  ): S3Client {
    return new S3Client({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });
  }

  /**
   * Test S3 ListObjects access
   */
  async testListAccess(
    credentials: TemporaryCredentials,
    bucket: string,
    region: string,
    prefix: string,
  ): Promise<void> {
    this.logger.log(`Testing S3 list access: s3://${bucket}/${prefix}`);

    try {
      const s3 = this.createS3Client(credentials, region);
      await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          MaxKeys: 1,
        }),
      );
      this.logger.log('✅ S3 ListObjects test passed');
    } catch (error: any) {
      this.logger.error(`❌ S3 ListObjects test failed: ${error.message}`);
      const err = new Error(`S3 list access failed: ${error.message}`);
      (err as any).step = 'listObjects';
      throw err;
    }
  }

  /**
   * Test S3 PutObject access by uploading and cleaning up a small test file
   */
  async testUploadAccess(
    credentials: TemporaryCredentials,
    bucket: string,
    region: string,
    prefix: string,
  ): Promise<void> {
    const testKey = `${prefix ? prefix.replace(/\/$/, '') + '/' : ''}.ddp-access-test-${Date.now()}.txt`;
    this.logger.log(`Testing S3 upload access: s3://${bucket}/${testKey}`);

    try {
      const s3 = this.createS3Client(credentials, region);

      // Upload test file
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: testKey,
          Body: 'Data Delivery Platform - Access Validation Test',
          ContentType: 'text/plain',
        }),
      );

      // Cleanup test file
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: testKey,
        }),
      );

      this.logger.log('✅ S3 PutObject test passed');
    } catch (error: any) {
      this.logger.error(`❌ S3 PutObject test failed: ${error.message}`);
      const err = new Error(`S3 upload access failed: ${error.message}`);
      (err as any).step = 'uploadObject';
      throw err;
    }
  }
}
