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
    const baseURL = configService.get<string>(
      'RCLONE_RC_URL',
      'http://localhost:5572',
    );
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
      skipDeletion?: boolean;
      filterFrom?: string;
    },
  ): Promise<RcloneJobResult> {
    // If skipDeletion is enabled for sync, we perform copy instead of sync to prevent deleting any files on destination
    let effectiveMode = mode;
    if (options?.skipDeletion && mode === 'sync') {
      effectiveMode = 'copy';
    }
    const endpoint =
      effectiveMode === 'move' ? '/sync/move' : `/sync/${effectiveMode}`;

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
    if (options?.filterFrom) payload['--filter-from'] = options.filterFrom;

    // Add performance optimizations for S3 and Google Drive transfers
    payload['--buffer-size'] = '64M';
    payload['--drive-chunk-size'] = '64M';
    payload['--s3-upload-cutoff'] = '64M';
    payload['--s3-chunk-size'] = '64M';
    payload['--fast-list'] = true;

    this.logger.log(
      `Starting rclone ${effectiveMode}: ${srcFs} → ${dstFs} (group: ${group})${options?.skipDeletion ? ' [no-delete]' : ''}`,
    );

    try {
      const response = await this.client.post(endpoint, payload);
      this.logger.log(`rclone job started: jobid=${response.data.jobid}`);
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Failed to start rclone ${effectiveMode}: ${error.message}`,
      );
      throw new Error(
        `rclone ${effectiveMode} failed: ${error.response?.data?.error || error.message}`,
      );
    }
  }

  /**
   * Start a dry-run copy/sync/move to simulate what would happen without making changes.
   * Returns stats about files to transfer, delete, etc.
   */
  async startDryRun(
    srcFs: string,
    dstFs: string,
    group: string,
    mode: 'copy' | 'sync' | 'move',
    options?: { checkers?: number; filterFrom?: string },
  ): Promise<RcloneJobResult> {
    const payload: any = {
      command: mode,
      arg: [
        srcFs,
        dstFs,
        '--dry-run',
        '--fast-list',
        '--drive-chunk-size=64M',
        '--buffer-size=64M',
        '-v',
      ],
      _async: true,
      _group: group,
    };

    if (options?.checkers) payload.arg.push(`--checkers=${options.checkers}`);
    if (options?.filterFrom) payload.arg.push(`--filter-from=${options.filterFrom}`);

    this.logger.log(
      `Starting rclone dry-run ${mode} via core/command: ${srcFs} → ${dstFs} (group: ${group})`,
    );

    try {
      const response = await this.client.post('/core/command', payload);
      this.logger.log(
        `rclone dry-run job started: jobid=${response.data.jobid}`,
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to start rclone dry-run: ${error.message}`);
      throw new Error(
        `rclone dry-run failed: ${error.response?.data?.error || error.message}`,
      );
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
      this.logger.log(
        `Credentials updated in-memory for remote: ${remoteName}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to update credentials for ${remoteName}: ${error.message}`,
      );
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
      const detail = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;
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
      const response = await this.client.post(
        '/operations/list',
        {
          fs,
          remote,
          opt,
        },
        {
          timeout: 120000, // 2 minutes timeout for listing
        },
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Failed to list directory on ${fs} at path ${remote}: ${error.message}`,
      );
      throw new Error(
        `rclone list failed: ${error.response?.data?.error || error.message}`,
      );
    }
  }

  /**
   * Calculate total size and file count of a remote path recursively using fast list if possible
   */
  async calculateSize(
    fs: string,
    remote: string,
  ): Promise<{ count: number; bytes: number }> {
    const targetPath = remote ? `${fs}:${remote}` : fs;
    try {
      this.logger.log(`Calculating size fast for: ${targetPath}`);
      const response = await this.client.post(
        '/core/command',
        {
          command: 'size',
          arg: [targetPath, '--fast-list'],
        },
        {
          timeout: 180000, // 3 minutes timeout
        },
      );

      const output = response.data.output || '';
      let count = 0;
      let bytes = 0;

      const countMatch = output.match(/Total objects:\s*(\d+)/i);
      if (countMatch) {
        count = parseInt(countMatch[1], 10);
      }

      const bytesMatch = output.match(
        /Total size:.*?\((0|[1-9]\d*)\s*Bytes?\)/i,
      );
      if (bytesMatch) {
        bytes = parseInt(bytesMatch[1], 10);
      } else {
        const bytesMatchAlt = output.match(/\((0|[1-9]\d*)\s*bytes?\)/i);
        if (bytesMatchAlt) {
          bytes = parseInt(bytesMatchAlt[1], 10);
        }
      }

      this.logger.log(`Size calculated fast: ${count} objects, ${bytes} bytes`);
      return { count, bytes };
    } catch (error: any) {
      this.logger.warn(
        `Fast size calculation failed on ${targetPath}: ${error.message}. Falling back to standard operations/size...`,
      );
      try {
        const response = await this.client.post(
          '/operations/size',
          {
            fs,
            remote,
          },
          {
            timeout: 600000, // 10 minutes timeout
          },
        );
        return response.data;
      } catch (fallbackError: any) {
        this.logger.error(
          `Failed to calculate size on ${fs} at path ${remote}: ${fallbackError.message}`,
        );
        throw new Error(
          `rclone size failed: ${fallbackError.response?.data?.error || fallbackError.message}`,
        );
      }
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

    this.logger.log(
      `Starting rclone check: ${srcFs} vs ${dstFs} (group: ${group})`,
    );

    try {
      const response = await this.client.post('/operations/check', payload, {
        timeout: 60000,
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to start rclone check: ${error.message}`);
      throw new Error(
        `rclone check failed: ${error.response?.data?.error || error.message}`,
      );
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
      const response = await this.client.post(
        '/core/command',
        {
          command: 'dedupe',
          arg: [fs],
          opt: { 'dedupe-mode': mode },
        },
        {
          timeout: 600000, // 10 minutes timeout for deduplication
        },
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to dedupe on ${fs}: ${error.message}`);
      throw new Error(
        `rclone dedupe failed: ${error.response?.data?.error || error.message}`,
      );
    }
  }

  /**
   * Get the ID of a directory or file path on a remote.
   * Returns the ID string if found, or null otherwise.
   */
  async getPathId(fs: string, remote: string): Promise<string | null> {
    try {
      const response = await this.client.post('/operations/stat', {
        fs,
        remote,
      });
      return response.data?.ID || null;
    } catch (error: any) {
      this.logger.warn(
        `Failed to get ID for path ${remote} on ${fs}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Fetch a specific range of bytes from a remote file (using rclone cat) with auto-retries and backoff
   */
  async fetchFileRange(
    fs: string,
    remote: string,
    bytesCount: number,
  ): Promise<Buffer> {
    const cleanFs = fs.endsWith(':') ? fs.slice(0, -1) : fs;
    const targetPath = remote ? `${cleanFs}:${remote}` : fs;

    const maxRetries = 3;
    let delay = 500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.post(
          '/core/command',
          {
            command: 'cat',
            arg: [targetPath, '--count', bytesCount.toString()],
            returnType: 'STREAM_ONLY_STDOUT',
          },
          {
            responseType: 'arraybuffer',
            timeout: 60000, // 60 seconds timeout
          },
        );
        return Buffer.from(response.data);
      } catch (error: any) {
        this.logger.warn(
          `Attempt ${attempt} failed to fetch file range for ${targetPath}: ${error.message}`,
        );
        if (attempt === maxRetries) {
          this.logger.error(
            `Failed to fetch file range for ${targetPath} after ${maxRetries} attempts`,
          );
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
    throw new Error(`Failed to fetch file range for ${targetPath}`);
  }

  /**
   * Parse WAV file header buffer to calculate audio duration
   */
  parseWavDuration(buffer: Buffer, fileSize: number): number {
    if (buffer.length < 44) return 0;

    let riffOffset = buffer.indexOf('RIFF');
    if (riffOffset === -1) {
      riffOffset = buffer.indexOf('RF64');
    }
    if (riffOffset === -1 || riffOffset + 12 > buffer.length) {
      return 0; // No RIFF or RF64 signature found
    }

    const wave = buffer.toString('ascii', riffOffset + 8, riffOffset + 12);
    if (wave !== 'WAVE') {
      return 0; // Not a valid WAV file
    }

    let offset = riffOffset + 12;
    let byteRate = 0;
    let dataSize = 0;

    try {
      // Walk RIFF chunks
      while (offset + 8 <= buffer.length) {
        const chunkId = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        offset += 8;

        if (chunkId === 'fmt ') {
          if (chunkSize >= 12 && offset + 12 <= buffer.length) {
            byteRate = buffer.readUInt32LE(offset + 8);
          }
        } else if (chunkId === 'data') {
          dataSize = chunkSize;
          break; // Found fmt and data, can stop walking
        }

        if (chunkSize <= 0 || offset + chunkSize > fileSize) {
          break; // Avoid infinite loops or invalid offsets
        }

        offset += chunkSize;
      }
    } catch (e) {
      // Ignore reading errors due to buffer truncation
    }

    if (byteRate > 0) {
      // Handle undefined/invalid chunk size (e.g. streaming WAV files or RF64 chunks written with 0xFFFFFFFF)
      if (dataSize === 0xffffffff || dataSize === 0 || dataSize >= fileSize) {
        dataSize = Math.max(0, fileSize - offset);
      }

      if (dataSize > 0) {
        return dataSize / byteRate;
      }
      // Fallback: estimate based on file size minus standard header length
      const estimatedDataSize = Math.max(0, fileSize - (riffOffset + 44));
      return estimatedDataSize / byteRate;
    }

    return 0;
  }

  /**
   * Scan directory recursively, identify WAV files, and calculate their durations.
   * Reports progress in real-time.
   */
  async calculateWavDurationOfPath(
    fs: string,
    remote: string,
    onProgress?: (progress: {
      scanned: number;
      total: number;
      currentFile: string;
    }) => void,
  ): Promise<{
    totalDuration: number;
    wavCount: number;
    files: Array<{
      name: string;
      path: string;
      size: number;
      duration: number;
    }>;
    skippedCount: number;
  }> {
    this.logger.log(`Listing files for WAV analysis: ${fs} ${remote}`);
    const dirList = await this.listDirectory(fs, remote, { recurse: true });
    const list = dirList.list || [];

    const wavFiles = list.filter(
      (item: any) => !item.IsDir && item.Name.toLowerCase().endsWith('.wav'),
    );
    const skippedCount = list.filter(
      (item: any) => !item.IsDir && !item.Name.toLowerCase().endsWith('.wav'),
    ).length;

    this.logger.log(
      `Found ${wavFiles.length} WAV files to analyze out of ${list.length} total objects`,
    );

    const files: Array<{
      name: string;
      path: string;
      size: number;
      duration: number;
    }> = [];
    let scanned = 0;

    // Storage-aware concurrency limit to prevent rate limiting (especially on Google Drive)
    const isGDrive = fs.toLowerCase().includes('gdrive');
    const concurrencyLimit = isGDrive ? 8 : 20;

    let index = 0;
    const workers = Array(Math.min(concurrencyLimit, wavFiles.length))
      .fill(null)
      .map(async () => {
        while (index < wavFiles.length) {
          const file = wavFiles[index++];
          if (!file) break;

          let duration = 0;
          try {
            // Fetch up to 64KB to cover large JUNK/LIST/bext metadata headers safely
            const bytesToFetch = Math.min(65536, file.Size);
            if (bytesToFetch >= 44) {
              const buffer = await this.fetchFileRange(
                fs,
                file.Path,
                bytesToFetch,
              );
              duration = this.parseWavDuration(buffer, file.Size);
            }
          } catch (error: any) {
            this.logger.warn(
              `Failed to parse WAV duration for ${file.Path}: ${error.message}`,
            );
          } finally {
            scanned++;
            files.push({
              name: file.Name,
              path: file.Path,
              size: file.Size,
              duration: parseFloat(duration.toFixed(2)),
            });
            if (onProgress) {
              onProgress({
                scanned,
                total: wavFiles.length,
                currentFile: file.Name,
              });
            }
          }
        }
      });

    await Promise.all(workers);

    const totalDuration = parseFloat(
      files.reduce((sum, f) => sum + f.duration, 0).toFixed(2),
    );

    return {
      totalDuration,
      wavCount: files.length,
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      skippedCount,
    };
  }
}
