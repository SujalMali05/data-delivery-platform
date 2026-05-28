import { Injectable, Logger } from '@nestjs/common';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { ConfigService } from '@nestjs/config';

export interface TemporaryCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

@Injectable()
export class StsService {
  private readonly logger = new Logger('StsService');
  private readonly stsClient: STSClient;

  constructor(private readonly configService: ConfigService) {
    const region = configService.get<string>('AWS_REGION', 'ap-south-1');
    const accessKeyId = configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = configService.get<string>('AWS_SECRET_ACCESS_KEY');

    const clientConfig: any = { region };

    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId,
        secretAccessKey,
      };
      this.logger.log('🔑 STSClient initialized with configured IAM User access keys');
    } else {
      this.logger.log('☁️ STSClient initialized with environment/instance credentials');
    }

    this.stsClient = new STSClient(clientConfig);
  }

  /**
   * Assume a cross-account IAM role to get temporary credentials.
   * Session duration: 1 hour (default). We refresh every 50 minutes.
   */
  async assumeRole(
    roleArn: string,
    externalId?: string,
    sessionName?: string,
    durationSeconds: number = 3600,
  ): Promise<TemporaryCredentials> {
    const operationalRoleArn = this.configService.get<string>('AWS_OPERATIONAL_ROLE_ARN');

    let stsClientToUse = this.stsClient;

    if (operationalRoleArn) {
      this.logger.log(`Performing role chaining: assuming operational role first: ${operationalRoleArn}`);
      try {
        const opCommand = new AssumeRoleCommand({
          RoleArn: operationalRoleArn,
          RoleSessionName: `ddp-ops-${Date.now()}`,
          DurationSeconds: 3600,
        });

        const opResponse = await this.stsClient.send(opCommand);

        if (
          !opResponse.Credentials?.AccessKeyId ||
          !opResponse.Credentials?.SecretAccessKey ||
          !opResponse.Credentials?.SessionToken
        ) {
          throw new Error('STS returned incomplete credentials for operational role');
        }

        this.logger.log(`✅ Successfully assumed operational role. Now assuming customer role.`);

        stsClientToUse = new STSClient({
          region: this.configService.get<string>('AWS_REGION', 'ap-south-1'),
          credentials: {
            accessKeyId: opResponse.Credentials.AccessKeyId,
            secretAccessKey: opResponse.Credentials.SecretAccessKey,
            sessionToken: opResponse.Credentials.SessionToken,
          },
        });
      } catch (error: any) {
        this.logger.error(`❌ Failed to assume operational role: ${error.message}`);
        const err = new Error(`Operational role AssumeRole failed: ${error.message}`);
        (err as any).step = 'assumeOperationalRole';
        throw err;
      }
    }

    this.logger.log(`Assuming customer role: ${roleArn}`);

    try {
      const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: sessionName || `ddp-transfer-${Date.now()}`,
        DurationSeconds: durationSeconds,
        ...(externalId ? { ExternalId: externalId } : {}),
      });

      const response = await stsClientToUse.send(command);

      if (
        !response.Credentials?.AccessKeyId ||
        !response.Credentials?.SecretAccessKey ||
        !response.Credentials?.SessionToken
      ) {
        throw new Error('STS returned incomplete credentials for customer role');
      }

      const credentials: TemporaryCredentials = {
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken,
        expiration: response.Credentials.Expiration || new Date(Date.now() + durationSeconds * 1000),
      };

      this.logger.log(
        `✅ AssumeRole successful. Expires at: ${credentials.expiration.toISOString()}`,
      );

      return credentials;
    } catch (error: any) {
      this.logger.error(`❌ AssumeRole failed for customer role: ${error.message}`);
      const err = new Error(`Customer role AssumeRole failed: ${error.message}`);
      (err as any).step = 'assumeCustomerRole';
      throw err;
    }
  }
}
