import { Injectable, Logger } from '@nestjs/common';
import { RcloneService } from './rclone.service';
import { TemporaryCredentials } from '../aws/sts.service';

/**
 * Manages dynamic rclone remote configuration for transfer jobs.
 * Creates temporary remotes per-job and cleans them up after completion.
 */
@Injectable()
export class RcloneConfigService {
  private readonly logger = new Logger('RcloneConfigService');

  constructor(private readonly rcloneService: RcloneService) {}

  /**
   * Create a Google Drive remote for a transfer job.
   * Supports two auth modes:
   *   - SERVICE_ACCOUNT: uses a service account JSON key file
   *   - OAUTH: uses a user's OAuth2 client_id / client_secret / token JSON
   */
  async createGdriveRemote(
    jobId: string,
    options: {
      serviceAccountFile?: string;
      teamDriveId?: string;
      authType?: 'SERVICE_ACCOUNT' | 'OAUTH';
      clientId?: string;
      clientSecret?: string;
      tokenJson?: string;
      rootFolderId?: string;
    } = {},
  ): Promise<string> {
    const remoteName = `gdrive-${jobId}`;

    const parameters: Record<string, string> = {
      type: 'drive',
      pacer_min_sleep: '10ms',
      pacer_burst: '200',
    };

    if (options.rootFolderId) {
      parameters['root_folder_id'] = options.rootFolderId;
    }

    if (options.authType === 'OAUTH') {
      // ── OAuth2 User Token auth ──────────────────────────
      if (options.clientId) parameters['client_id'] = options.clientId;
      if (options.clientSecret)
        parameters['client_secret'] = options.clientSecret;
      if (options.tokenJson) parameters['token'] = options.tokenJson;
      parameters['scope'] = 'drive';
    } else {
      // ── Service Account auth (default) ──────────────────
      if (options.serviceAccountFile) {
        parameters['service_account_file'] = options.serviceAccountFile;
        if (!options.teamDriveId && !process.env.GOOGLE_IMPERSONATE_USER) {
          parameters['shared_with_me'] = 'true';
        }
      }

      if (process.env.GOOGLE_IMPERSONATE_USER) {
        parameters['impersonate'] = process.env.GOOGLE_IMPERSONATE_USER;
      }
    }

    if (options.teamDriveId) {
      parameters['team_drive'] = options.teamDriveId;
      parameters['scope'] = 'drive';
    }

    await this.rcloneService.createRemote(remoteName, 'drive', parameters);
    this.logger.log(
      `Google Drive remote created: ${remoteName} (auth: ${options.authType || 'SERVICE_ACCOUNT'})`,
    );

    return remoteName;
  }

  /**
   * Create an S3 remote with temporary STS credentials
   */
  async createS3Remote(
    jobId: string,
    credentials: TemporaryCredentials,
    region: string,
  ): Promise<string> {
    const remoteName = `s3-${jobId}`;

    const parameters: Record<string, string> = {
      type: 's3',
      provider: 'AWS',
      access_key_id: credentials.accessKeyId,
      secret_access_key: credentials.secretAccessKey,
      session_token: credentials.sessionToken,
      region,
      no_check_bucket: 'true',
    };

    await this.rcloneService.createRemote(remoteName, 's3', parameters);
    this.logger.log(`S3 remote created: ${remoteName} (region: ${region})`);

    return remoteName;
  }

  /**
   * Update S3 remote credentials in-memory (for rotation during long transfers)
   */
  async refreshS3Credentials(
    jobId: string,
    credentials: TemporaryCredentials,
  ): Promise<void> {
    const remoteName = `s3-${jobId}`;

    await this.rcloneService.updateRemoteCredentials(remoteName, {
      access_key_id: credentials.accessKeyId,
      secret_access_key: credentials.secretAccessKey,
      session_token: credentials.sessionToken,
    });

    this.logger.log(`S3 credentials refreshed for remote: ${remoteName}`);
  }

  /**
   * Cleanup both remotes after job completion
   */
  async cleanupRemotes(jobId: string): Promise<void> {
    await this.rcloneService.deleteRemote(`gdrive-${jobId}`);
    await this.rcloneService.deleteRemote(`s3-${jobId}`);
    await this.rcloneService.resetStats(jobId);
    this.logger.log(`Remotes cleaned up for job: ${jobId}`);
  }
}
