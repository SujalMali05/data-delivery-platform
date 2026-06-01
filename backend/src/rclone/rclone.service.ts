import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface RcloneJobResult {
  jobid: number;
}

export interface RcloneStats {
  bytes: number;
  checks: number;
  deletedDirs: number;
  deletes: number;
  elapsedTime: number;
  errors: number;
  eta: number | null;
  fatalError: boolean;
  lastError: string;
  renames: number;
  retryError: boolean;
  speed: number;
  totalBytes: number;
  totalChecks: number;
  totalTransfers: number;
  transferTime: number;
  transfers: number;
  transferring?: Array<{
    bytes: number;
    eta: number;
    group: string;
    name: string;
    percentage: number;
    size: number;
    speed: number;
    speedAvg: number;
  }>;
}

export interface RcloneJobStatus {
  duration: number;
  endTime: string;
  error: string;
  finished: boolean;
  group: string;
  id: number;
  startTime: string;
  success: boolean;
  output?: any;
}

@Injectable()
export class RcloneService {
  private readonly logger = new Logger('RcloneService');
  private readonly client: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const baseURL = configService.get<string>('RCLONE_RC_URL', 'http://localhost:5572');
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.logger.log(`rclone RC client configured: ${baseURL}`);
  }

  /**
   * Check if rclone RC daemon is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.post('/core/version', {});
      this.logger.log(`rclone version: ${response.data.version}`);
      return true;
    } catch {
      this.logger.warn('rclone RC daemon is not reachable');
      return false;
    }
  }

  /**
   * Start an async copy/sync/move operation
   */
  async startTransfer(
    srcFs: string,
    dstFs: string,
    mode: 'copy' | 'sync' | 'move',
    group: string,
    options?: {
      transfers?: number;
      checkers?: number;
      retries?: number;
      bandwidthLimit?: string;
    },
  ): Promise<RcloneJobResult> {
    const endpoint = mode === 'move' ? '/sync/move' : `/sync/${mode}`;

    const payload: any = {
      srcFs,
      dstFs,
      _async: true,
      _group: group,
    };

    // Add optional parameters
    if (options?.transfers) payload['--transfers'] = options.transfers;
    if (options?.checkers) payload['--checkers'] = options.checkers;
    if (options?.retries) payload['--retries'] = options.retries;
    if (options?.bandwidthLimit) payload['--bwlimit'] = options.bandwidthLimit;

    // Add performance optimizations for S3 and Google Drive transfers
    payload['--buffer-size'] = '64M';
    payload['--drive-chunk-size'] = '64M';
    payload['--s3-upload-cutoff'] = '64M';
    payload['--s3-chunk-size'] = '64M';
    payload['--fast-list'] = true;

    this.logger.log(`Starting rclone ${mode}: ${srcFs} → ${dstFs} (group: ${group})`);

    try {
      const response = await this.client.post(endpoint, payload);
      this.logger.log(`rclone job started: jobid=${response.data.jobid}`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to start rclone ${mode}: ${error.message}`);
      throw new Error(`rclone ${mode} failed: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Get transfer statistics for a specific group
   */
  async getStats(group?: string): Promise<RcloneStats> {
    try {
      const payload = group ? { group } : {};
      const response = await this.client.post('/core/stats', payload);
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to get stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: number): Promise<RcloneJobStatus> {
    try {
      const response = await this.client.post('/job/status', { jobid: jobId });
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to get job status: ${error.message}`);
      throw error;
    }
  }

  /**
   * List all running jobs
   */
  async listJobs(): Promise<{ jobids: number[] }> {
    try {
      const response = await this.client.post('/job/list', {});
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to list jobs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stop a running job
   */
  async stopJob(jobId: number): Promise<void> {
    try {
      await this.client.post('/job/stop', { jobid: jobId });
      this.logger.log(`Job stopped: ${jobId}`);
    } catch (error: any) {
      this.logger.error(`Failed to stop job: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get active job ID for a specific transfer group name
   */
  async getActiveJobId(groupName: string): Promise<number | null> {
    try {
      const { jobids } = await this.listJobs();
      if (!jobids || jobids.length === 0) return null;

      for (const id of jobids) {
        try {
          const status = await this.getJobStatus(id);
          if (!status.finished && status.group === groupName) {
            return id;
          }
        } catch (statusError) {
          // If a job just finished or failed, getJobStatus might throw. Ignore and continue.
        }
      }
    } catch (error: any) {
      this.logger.warn(`Failed to search active rclone jobs: ${error.message}`);
    }
    return null;
  }

  /**
   * Update remote credentials in-memory (for credential rotation)
   * Uses /config/update to set new credentials without restarting
   */
  async updateRemoteCredentials(
    remoteName: string,
    credentials: {
      access_key_id: string;
      secret_access_key: string;
      session_token: string;
    },
  ): Promise<void> {
    try {
      await this.client.post('/config/update', {
        name: remoteName,
        parameters: {
          access_key_id: credentials.access_key_id,
          secret_access_key: credentials.secret_access_key,
          session_token: credentials.session_token,
        },
      });
      this.logger.log(`Credentials updated in-memory for remote: ${remoteName}`);
    } catch (error: any) {
      this.logger.error(`Failed to update credentials for ${remoteName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new remote dynamically via RC API.
   * For OAuth drive remotes (with a `token` param), uses a two-step approach:
   *   1. /config/create with a skeleton (nonInteractive) to register the name
   *   2. /config/update to set all real parameters (bypasses OAuth browser flow)
   */
  async createRemote(
    name: string,
    type: string,
    parameters: Record<string, string>,
  ): Promise<void> {
    try {
      const hasToken = !!parameters['token'];

      if (hasToken && type === 'drive') {
        // Step 1: Create skeleton remote (may partially fail — that's OK)
        try {
          await this.client.post('/config/create', {
            name,
            type,
            parameters: { scope: parameters['scope'] || 'drive' },
            opt: { nonInteractive: true },
          });
        } catch {
          // Expected: interactive flow will fail, but the remote entry is registered
        }

        // Step 2: Overwrite with real parameters (skips OAuth flow entirely)
        await this.client.post('/config/update', {
          name,
          parameters,
          opt: { nonInteractive: true },
        });
      } else {
        // Standard non-OAuth create
        await this.client.post('/config/create', {
          name,
          type,
          parameters,
        });
      }

      this.logger.log(`Remote created: ${name} (type: ${type})`);
    } catch (error: any) {
      const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      this.logger.error(`Failed to create remote ${name}: ${detail}`);
      throw error;
    }
  }

  /**
   * Check if a remote exists in rclone config
   */
  async remoteExists(name: string): Promise<boolean> {
    try {
      await this.client.post('/config/get', { name });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a remote
   */
  async deleteRemote(name: string): Promise<void> {
    try {
      await this.client.post('/config/delete', { name });
      this.logger.log(`Remote deleted: ${name}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete remote ${name}: ${error.message}`);
      // Don't throw — cleanup errors should not break the flow
    }
  }

  /**
   * Reset statistics for a group
   */
  async resetStats(group?: string): Promise<void> {
    try {
      const payload = group ? { group } : {};
      await this.client.post('/core/stats-reset', payload);
    } catch (error: any) {
      this.logger.warn(`Failed to reset stats: ${error.message}`);
    }
  }

  /**
   * List files/directories in a remote path
   */
  async listDirectory(
    fs: string,
    remote: string,
    opt?: { recurse?: boolean },
  ): Promise<any> {
    try {
      const response = await this.client.post('/operations/list', {
        fs,
        remote,
        opt,
      }, {
        timeout: 120000, // 2 minutes timeout for listing
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to list directory on ${fs} at path ${remote}: ${error.message}`);
      throw new Error(`rclone list failed: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Calculate total size and file count of a remote path recursively
   */
  async calculateSize(
    fs: string,
    remote: string,
  ): Promise<{ count: number; bytes: number }> {
    try {
      const response = await this.client.post('/operations/size', {
        fs,
        remote,
      }, {
        timeout: 600000, // 10 minutes timeout for recursive size calculations
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to calculate size on ${fs} at path ${remote}: ${error.message}`);
      throw new Error(`rclone size failed: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Start a recursive validation check between two paths asynchronously
   */
  async startCheck(
    srcFs: string,
    dstFs: string,
    group: string,
    oneWay = false,
  ): Promise<RcloneJobResult> {
    const payload = {
      srcFs,
      dstFs,
      _async: true,
      _group: group,
      oneWay,
      match: true,
      differ: true,
      missingOnSrc: true,
      missingOnDst: true,
      error: true,
    };

    this.logger.log(`Starting rclone check: ${srcFs} vs ${dstFs} (group: ${group})`);

    try {
      const response = await this.client.post('/operations/check', payload, {
        timeout: 60000,
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to start rclone check: ${error.message}`);
      throw new Error(`rclone check failed: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Run rclone dedupe CLI command via core/command RC API to resolve duplicates on a remote
   */
  async dedupe(
    fs: string,
    mode: 'newest' | 'oldest' | 'rename' | 'skip' = 'newest',
  ): Promise<any> {
    this.logger.log(`Running rclone dedupe on ${fs} with mode ${mode}`);
    try {
      const response = await this.client.post('/core/command', {
        command: 'dedupe',
        arg: [fs],
        opt: { 'dedupe-mode': mode },
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to dedupe on ${fs}: ${error.message}`);
      throw new Error(`rclone dedupe failed: ${error.response?.data?.error || error.message}`);
    }
  }
}
