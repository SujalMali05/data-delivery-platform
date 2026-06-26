import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RcloneService } from '../rclone/rclone.service';
import { RcloneConfigService } from '../rclone/rclone-config.service';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

@Injectable()
export class GdriveService implements OnApplicationBootstrap {
  private readonly logger = new Logger('GdriveService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rcloneService: RcloneService,
    private readonly rcloneConfig: RcloneConfigService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check Google Drive connection status via rclone
   */
  async getStatus() {
    try {
      const healthy = await this.rcloneService.healthCheck();
      return {
        rcloneConnected: healthy,
        oauthConfigured: !!this.configService.get(
          'GOOGLE_OAUTH_TOKEN',
        ),
      };
    } catch {
      return {
        rcloneConnected: false,
        oauthConfigured: false,
      };
    }
  }

  async onApplicationBootstrap() {
    this.logger.log('Verifying global Google Drive sources...');
    try {
      await this.prisma.googleDriveSource.upsert({
        where: { id: 'GLOBAL_OAUTH' },
        update: {},
        create: {
          id: 'GLOBAL_OAUTH',
          name: 'Global User Account',
          drivePath: '',
          authType: 'OAUTH',
          direction: 'PULL',
        },
      });
      this.logger.log('Global Google Drive sources verified.');
    } catch (err: any) {
      this.logger.error(
        `Failed to verify/seed global Google Drive sources: ${err.message}`,
      );
    }
  }

  /**
   * List saved Google Drive sources
   */
  async getSources() {
    return this.prisma.googleDriveSource.findMany({
      where: {
        NOT: [{ id: 'GLOBAL_SERVICE_ACCOUNT' }, { id: 'GLOBAL_OAUTH' }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { transfers: true },
        },
      },
    });
  }

  /**
   * Get a single source by ID
   */
  async getSourceById(id: string) {
    return this.prisma.googleDriveSource.findUnique({
      where: { id },
      include: {
        transfers: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, status: true, createdAt: true },
        },
      },
    });
  }

  /**
   * Resolve OAuth2 credentials from env vars
   */
  private getOAuthCredsFromEnv() {
    const clientId = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'GOOGLE_OAUTH_CLIENT_SECRET',
    );
    const tokenJson = this.configService.get<string>('GOOGLE_OAUTH_TOKEN');
    if (!clientId || !clientSecret || !tokenJson) {
      throw new Error(
        'OAuth2 credentials (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_TOKEN) are not configured in .env',
      );
    }
    return { clientId, clientSecret, tokenJson };
  }

  /**
   * Save a Google Drive source.
   * For OAUTH sources, credentials are auto-filled from env vars.
   */
  async createSource(data: {
    name: string;
    drivePath: string;
    driveType?: 'MY_DRIVE' | 'SHARED_DRIVE';
    sharedDriveId?: string;
    authType?: 'SERVICE_ACCOUNT' | 'OAUTH';
    direction?: 'PUSH' | 'PULL';
  }) {
    const authType = data.authType || 'OAUTH';

    // Auto-fill OAuth2 creds from env when authType is OAUTH
    let oauthCreds: {
      clientId: string;
      clientSecret: string;
      tokenJson: string;
    } | null = null;
    if (authType === 'OAUTH') {
      oauthCreds = this.getOAuthCredsFromEnv();
    }

    const source = await this.prisma.googleDriveSource.create({
      data: {
        name: data.name,
        drivePath: data.drivePath,
        driveType: data.driveType || 'MY_DRIVE',
        sharedDriveId: data.sharedDriveId,
        authType,
        direction: data.direction || 'PUSH',
        clientId: oauthCreds?.clientId,
        clientSecret: oauthCreds?.clientSecret,
        tokenJson: oauthCreds?.tokenJson,
      },
    });

    this.logger.log(
      `Google Drive source created: ${source.name} (${source.drivePath}, auth: ${source.authType})`,
    );
    return source;
  }

  /**
   * Delete a Google Drive source
   */
  async deleteSource(id: string) {
    await this.prisma.googleDriveSource.delete({ where: { id } });
    this.logger.log(`Google Drive source deleted: ${id}`);
    return { success: true };
  }

  /**
   * Browse Google Drive directories dynamically.
   * For OAUTH mode, credentials are auto-resolved from env vars.
   */
  async browsePath(
    path: string = '',
    sharedDriveId?: string,
    authType?: 'SERVICE_ACCOUNT' | 'OAUTH',
    showFiles?: boolean,
  ) {
    const tempJobId = `browse-${Date.now()}`;
    let remoteName = '';

    try {
      if (authType === 'OAUTH') {
        const { clientId, clientSecret, tokenJson } =
          this.getOAuthCredsFromEnv();
        remoteName = await this.rcloneConfig.createGdriveRemote(tempJobId, {
          authType: 'OAUTH',
          clientId,
          clientSecret,
          tokenJson,
          teamDriveId: sharedDriveId || undefined,
        });
      } else {
        const serviceAccountFile = this.configService.get<string>(
          'GOOGLE_SERVICE_ACCOUNT_FILE',
        );
        if (!serviceAccountFile) {
          throw new Error(
            'Google Service Account key file is not configured on the platform',
          );
        }
        remoteName = await this.rcloneConfig.createGdriveRemote(tempJobId, {
          serviceAccountFile,
          teamDriveId: sharedDriveId || undefined,
        });
      }

      const response = await this.rcloneService.listDirectory(
        `${remoteName}:`,
        path || '',
      );

      const list = response.list || [];
      const filtered = showFiles ? list : list.filter((item: any) => item.IsDir);
      return filtered.map((item: any) => ({
        name: item.Name,
        path: item.Path,
        isDir: item.IsDir,
        id: item.ID || null,
        size: item.Size || 0,
      }));
    } catch (error: any) {
      this.logger.error(`Error browsing Google Drive path: ${error.message}`);
      throw new Error(`Failed to browse Google Drive: ${error.message}`);
    } finally {
      if (remoteName) {
        await this.rcloneConfig.cleanupRemotes(tempJobId);
      }
    }
  }

  /**
   * Calculate size of a Google Drive path dynamically
   */
  async calculateSize(
    path: string = '',
    sharedDriveId?: string,
    authType?: 'SERVICE_ACCOUNT' | 'OAUTH',
  ) {
    const tempJobId = `size-${Date.now()}`;
    let remoteName = '';

    try {
      if (authType === 'OAUTH') {
        const { clientId, clientSecret, tokenJson } =
          this.getOAuthCredsFromEnv();
        remoteName = await this.rcloneConfig.createGdriveRemote(tempJobId, {
          authType: 'OAUTH',
          clientId,
          clientSecret,
          tokenJson,
          teamDriveId: sharedDriveId || undefined,
        });
      } else {
        const serviceAccountFile = this.configService.get<string>(
          'GOOGLE_SERVICE_ACCOUNT_FILE',
        );
        if (!serviceAccountFile) {
          throw new Error(
            'Google Service Account key file is not configured on the platform',
          );
        }
        remoteName = await this.rcloneConfig.createGdriveRemote(tempJobId, {
          serviceAccountFile,
          teamDriveId: sharedDriveId || undefined,
        });
      }

      const rcloneFs = path
        ? `${remoteName}:${path}`.replace(/\/$/, '')
        : `${remoteName}:`;
      return await this.rcloneService.calculateSize(rcloneFs, '');
    } catch (error: any) {
      this.logger.error(
        `Error calculating Google Drive size: ${error.message}`,
      );
      throw new Error(`Failed to calculate size: ${error.message}`);
    } finally {
      if (remoteName) {
        await this.rcloneConfig.cleanupRemotes(tempJobId);
      }
    }
  }

  /**
   * Execute manual dedupe on a Google Drive path
   */
  async dedupePath(
    sourceId: string,
    path: string = '',
    mode: 'newest' | 'oldest' | 'rename' | 'skip' = 'newest',
    sharedDriveId?: string,
    authType?: 'SERVICE_ACCOUNT' | 'OAUTH',
  ) {
    const tempJobId = `dedupe-${Date.now()}`;
    let remoteName = '';

    try {
      let source: any = null;
      if (sourceId) {
        source = await this.prisma.googleDriveSource.findUnique({
          where: { id: sourceId },
        });
      }

      let finalAuthType = source
        ? source.authType || 'OAUTH'
        : authType || 'OAUTH';
      const finalSharedDriveId = source
        ? source.sharedDriveId || undefined
        : sharedDriveId || undefined;

      const hasEnvOAuth = !!(
        this.configService.get('GOOGLE_OAUTH_CLIENT_ID') &&
        this.configService.get('GOOGLE_OAUTH_CLIENT_SECRET') &&
        this.configService.get('GOOGLE_OAUTH_TOKEN')
      );

      // Force OAUTH for deduplication if it's a global source or we have OAuth credentials and are dealing with a service account
      // that cannot delete/rename files in personal My Drives.
      if (
        hasEnvOAuth &&
        (sourceId === 'GLOBAL_SERVICE_ACCOUNT' ||
          sourceId === 'GLOBAL_OAUTH' ||
          finalAuthType === 'SERVICE_ACCOUNT')
      ) {
        this.logger.log(
          `Using OAuth2 credentials for manual deduplication on source: ${sourceId}`,
        );
        finalAuthType = 'OAUTH';
      }

      if (finalAuthType === 'OAUTH') {
        const clientId =
          source?.clientId ||
          this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
        const clientSecret =
          source?.clientSecret ||
          this.configService.get<string>('GOOGLE_OAUTH_CLIENT_SECRET');
        const tokenJson =
          source?.tokenJson ||
          this.configService.get<string>('GOOGLE_OAUTH_TOKEN');
        if (!clientId || !clientSecret || !tokenJson) {
          throw new Error(
            'OAuth2 credentials (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_TOKEN) are not configured',
          );
        }
        remoteName = await this.rcloneConfig.createGdriveRemote(tempJobId, {
          authType: 'OAUTH',
          clientId,
          clientSecret,
          tokenJson,
          teamDriveId: finalSharedDriveId,
        });
      } else {
        const serviceAccountFile = this.configService.get<string>(
          'GOOGLE_SERVICE_ACCOUNT_FILE',
        );
        if (!serviceAccountFile) {
          throw new Error(
            'Google Service Account key file is not configured on the platform',
          );
        }
        remoteName = await this.rcloneConfig.createGdriveRemote(tempJobId, {
          serviceAccountFile,
          teamDriveId: finalSharedDriveId,
        });
      }

      const drivePath = source
        ? (source.drivePath || '').replace(/^\/|\/$/g, '')
        : '';
      const cleanSubPath = path ? path.replace(/^\/|\/$/g, '') : '';
      const cleanPath = drivePath
        ? cleanSubPath
          ? `${drivePath}/${cleanSubPath}`
          : drivePath
        : cleanSubPath;
      const rcloneFs = cleanPath
        ? `${remoteName}:${cleanPath}`.replace(/\/$/, '')
        : `${remoteName}:`;

      this.logger.log(
        `Executing manual dedupe on: ${rcloneFs} with mode ${mode}`,
      );
      const result = await this.rcloneService.dedupe(rcloneFs, mode);
      return { success: true, result };
    } catch (error: any) {
      this.logger.error(
        `Error executing Google Drive dedupe: ${error.message}`,
      );
      throw new Error(`Failed to dedupe Google Drive path: ${error.message}`);
    } finally {
      if (remoteName) {
        await this.rcloneConfig.cleanupRemotes(tempJobId);
      }
    }
  }

  /**
   * Calculate cumulative audio duration for all WAV files recursively inside a Google Drive path
   */
  async calculateWavDuration(
    path: string = '',
    sharedDriveId?: string,
    authType?: 'SERVICE_ACCOUNT' | 'OAUTH',
    onProgress?: (progress: {
      scanned: number;
      total: number;
      currentFile: string;
    }) => void,
  ) {
    const tempJobId = `wav-duration-temp-${Date.now()}`;
    const runJobId = `wav-duration-run-${Date.now()}`;
    let tempRemoteName = '';
    let runRemoteName = '';

    try {
      // 1. Create a temporary remote to resolve the path ID
      if (authType === 'OAUTH') {
        const { clientId, clientSecret, tokenJson } =
          this.getOAuthCredsFromEnv();
        tempRemoteName = await this.rcloneConfig.createGdriveRemote(tempJobId, {
          authType: 'OAUTH',
          clientId,
          clientSecret,
          tokenJson,
          teamDriveId: sharedDriveId || undefined,
        });
      } else {
        const serviceAccountFile = this.configService.get<string>(
          'GOOGLE_SERVICE_ACCOUNT_FILE',
        );
        if (!serviceAccountFile) {
          throw new Error(
            'Google Service Account key file is not configured on the platform',
          );
        }
        tempRemoteName = await this.rcloneConfig.createGdriveRemote(tempJobId, {
          serviceAccountFile,
          teamDriveId: sharedDriveId || undefined,
        });
      }

      // 2. Resolve target folder ID if path is specified
      let rootFolderId: string | null = null;
      const cleanPath = path ? path.replace(/^\/|\/$/g, '') : '';
      if (cleanPath) {
        rootFolderId = await this.rcloneService.getPathId(
          `${tempRemoteName}:`,
          cleanPath,
        );
      }

      // Clean up the temporary remote immediately after resolving path ID
      await this.rcloneConfig.cleanupRemotes(tempJobId);
      tempRemoteName = '';

      // 3. Create the final run remote rooted at the target folder ID (or top level if not resolved)
      if (authType === 'OAUTH') {
        const { clientId, clientSecret, tokenJson } =
          this.getOAuthCredsFromEnv();
        runRemoteName = await this.rcloneConfig.createGdriveRemote(runJobId, {
          authType: 'OAUTH',
          clientId,
          clientSecret,
          tokenJson,
          teamDriveId: sharedDriveId || undefined,
          rootFolderId: rootFolderId || undefined,
        });
      } else {
        const serviceAccountFile = this.configService.get<string>(
          'GOOGLE_SERVICE_ACCOUNT_FILE',
        );
        runRemoteName = await this.rcloneConfig.createGdriveRemote(runJobId, {
          serviceAccountFile,
          teamDriveId: sharedDriveId || undefined,
          rootFolderId: rootFolderId || undefined,
        });
      }

      // 4. Run the WAV analysis. If rooted, path should be empty (since remote is already at target folder)
      const analysisPath = rootFolderId ? '' : cleanPath;
      this.logger.log(
        `Executing calculateWavDurationOfPath on ${runRemoteName}: with path: "${analysisPath}" (rootFolderId: ${rootFolderId})`,
      );
      return await this.rcloneService.calculateWavDurationOfPath(
        `${runRemoteName}:`,
        analysisPath,
        onProgress,
      );
    } catch (error: any) {
      this.logger.error(
        `Error calculating Google Drive WAV duration: ${error.message}`,
      );
      throw new Error(`Failed to calculate WAV duration: ${error.message}`);
    } finally {
      if (tempRemoteName) {
        await this.rcloneConfig.cleanupRemotes(tempJobId);
      }
      if (runRemoteName) {
        await this.rcloneConfig.cleanupRemotes(runJobId);
      }
    }
  }

  /**
   * Compare audio and transcription Google Drive folders, find matches, and calculate duration.
   */
  async calculateWavDurationCompare(
    audioFolderLink: string,
    transcriptFolderLink: string,
    sharedDriveId?: string,
    authType?: 'SERVICE_ACCOUNT' | 'OAUTH',
    onProgress?: (progress: {
      scanned: number;
      total: number;
      currentFile: string;
    }) => void,
  ) {
    const audioFolderId = this.extractFolderIdFromLink(audioFolderLink);
    const transcriptFolderId = this.extractFolderIdFromLink(transcriptFolderLink);

    if (!audioFolderId || !transcriptFolderId) {
      throw new Error('Invalid Google Drive folder link(s) provided.');
    }

    const serviceAccountFile = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_FILE') || '/config/rclone/service-account.json';

    // Validate folder access before remote creation to prevent rclone silent fallback to root
    if (onProgress) {
      onProgress({ scanned: 0, total: 0, currentFile: 'Validating folder access...' });
    }
    await this.validateFolderAccess(audioFolderId, serviceAccountFile, authType);
    await this.validateFolderAccess(transcriptFolderId, serviceAccountFile, authType);

    const audioJobId = `compare-audio-${Date.now()}`;
    const transcriptJobId = `compare-trans-${Date.now()}`;
    let audioRemote = '';
    let transcriptRemote = '';

    try {
      // Create remotes rooted at the respective folders
      if (authType === 'OAUTH') {
        const { clientId, clientSecret, tokenJson } = this.getOAuthCredsFromEnv();
        audioRemote = await this.rcloneConfig.createGdriveRemote(audioJobId, {
          authType: 'OAUTH',
          clientId,
          clientSecret,
          tokenJson,
          teamDriveId: sharedDriveId || undefined,
          rootFolderId: audioFolderId,
        });
        transcriptRemote = await this.rcloneConfig.createGdriveRemote(transcriptJobId, {
          authType: 'OAUTH',
          clientId,
          clientSecret,
          tokenJson,
          teamDriveId: sharedDriveId || undefined,
          rootFolderId: transcriptFolderId,
        });
      } else {
        if (!serviceAccountFile) {
          throw new Error('Google Service Account key file is not configured on the platform');
        }
        audioRemote = await this.rcloneConfig.createGdriveRemote(audioJobId, {
          serviceAccountFile,
          teamDriveId: sharedDriveId || undefined,
          rootFolderId: audioFolderId,
        });
        transcriptRemote = await this.rcloneConfig.createGdriveRemote(transcriptJobId, {
          serviceAccountFile,
          teamDriveId: sharedDriveId || undefined,
          rootFolderId: transcriptFolderId,
        });
      }

      // List files recursively from both
      if (onProgress) {
        onProgress({ scanned: 0, total: 0, currentFile: 'Listing transcription folder...' });
      }
      this.logger.log(`Listing transcription folder: ${transcriptRemote}:`);
      const transListRes = await this.rcloneService.listDirectory(`${transcriptRemote}:`, '', { recurse: true });
      const transItems = transListRes.list || [];

      // Extract bases
      const getBaseName = (pathOrName: string) => {
        const lastDot = pathOrName.lastIndexOf('.');
        const base = lastDot === -1 ? pathOrName : pathOrName.substring(0, lastDot);
        return base.toLowerCase().trim();
      };

      const transPathsSet = new Set<string>();
      const transNamesSet = new Set<string>();

      for (const item of transItems) {
        if (!item.IsDir) {
          transPathsSet.add(getBaseName(item.Path));
          transNamesSet.add(getBaseName(item.Name));
        }
      }

      if (onProgress) {
        onProgress({ scanned: 0, total: 0, currentFile: 'Listing audio folder (may take 2-3 minutes)...' });
      }
      this.logger.log(`Listing audio folder: ${audioRemote}:`);
      const audioListRes = await this.rcloneService.listDirectory(`${audioRemote}:`, '', { recurse: true });
      const audioItems = audioListRes.list || [];

      // Filter audio files matching the transcription files
      const matchedAudioFiles: any[] = [];
      let skippedCount = 0;

      for (const item of audioItems) {
        if (item.IsDir) continue;
        if (item.Name.toLowerCase().endsWith('.wav')) {
          const pathBase = getBaseName(item.Path);
          const nameBase = getBaseName(item.Name);
          if (transPathsSet.has(pathBase) || transNamesSet.has(nameBase)) {
            matchedAudioFiles.push(item);
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      }

      this.logger.log(`Found ${matchedAudioFiles.length} matched WAV files to analyze out of ${audioItems.length} total objects`);

      if (onProgress) {
        onProgress({ scanned: 0, total: matchedAudioFiles.length, currentFile: `Found ${matchedAudioFiles.length} matched audios. Starting duration extraction...` });
      }

      // Run WAV duration calculations on matched files
      return await this.rcloneService.calculateWavDurationForList(
        `${audioRemote}:`,
        matchedAudioFiles,
        skippedCount,
        onProgress
      );

    } catch (error: any) {
      this.logger.error(
        `Error performing Google Drive WAV duration compare scan: ${error.message}`,
      );
      throw new Error(`Failed to compare WAV folder duration: ${error.message}`);
    } finally {
      if (audioRemote) {
        await this.rcloneConfig.cleanupRemotes(audioJobId);
      }
      if (transcriptRemote) {
        await this.rcloneConfig.cleanupRemotes(transcriptJobId);
      }
    }
  }

  private async validateFolderAccess(
    folderId: string,
    serviceAccountFile: string,
    authType?: 'SERVICE_ACCOUNT' | 'OAUTH',
  ): Promise<void> {
    try {
      let accessToken = '';

      if (authType === 'OAUTH') {
        const { tokenJson } = this.getOAuthCredsFromEnv();
        const parsed = JSON.parse(tokenJson);
        accessToken = parsed.access_token;
        if (!accessToken) {
          throw new Error('OAuth access token not found in tokenJson.');
        }
      } else {
        // Resolve container path to host path if running on host outside Docker
        let hostSaPath = serviceAccountFile;
        if (serviceAccountFile.startsWith('/config/rclone')) {
          const hostConfigDir = path.resolve(process.cwd(), '../rclone-config');
          hostSaPath = serviceAccountFile.replace('/config/rclone', hostConfigDir);
        }

        if (!fs.existsSync(hostSaPath)) {
          throw new Error(`Service Account file not found at: ${hostSaPath} (resolved from ${serviceAccountFile})`);
        }
        const sa = JSON.parse(fs.readFileSync(hostSaPath, 'utf8'));

        // ── Sign JWT ───────────────────────────────────────
        const header = { alg: 'RS256', typ: 'JWT' };
        const now = Math.floor(Date.now() / 1000);
        const payload = {
          iss: sa.client_email,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
          aud: 'https://oauth2.googleapis.com/token',
          exp: now + 3600,
          iat: now,
        };

        const base64UrlEncode = (str: string) => {
          return Buffer.from(str)
            .toString('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
        };

        const encodedHeader = base64UrlEncode(JSON.stringify(header));
        const encodedPayload = base64UrlEncode(JSON.stringify(payload));
        const signatureInput = `${encodedHeader}.${encodedPayload}`;

        const signer = crypto.createSign('RSA-SHA256');
        signer.update(signatureInput);
        const signature = signer.sign(sa.private_key, 'base64')
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');

        const jwt = `${signatureInput}.${signature}`;

        // ── Get Token ──────────────────────────────────────
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        });
        accessToken = tokenResponse.data.access_token;
      }

      // ── Verify Folder ──────────────────────────────────
      const url = `https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true&fields=id,name,mimeType`;
      try {
        await axios.get(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } catch (getErr: any) {
        // If unauthorized (401), try to refresh token and retry if it's OAUTH
        if (getErr.response?.status === 401 && authType === 'OAUTH') {
          const { clientId, clientSecret, tokenJson } = this.getOAuthCredsFromEnv();
          const parsed = JSON.parse(tokenJson);
          if (parsed.refresh_token) {
            this.logger.log(`OAuth access token for folder validation has expired. Refreshing token...`);
            const refreshResponse = await axios.post('https://oauth2.googleapis.com/token', {
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: parsed.refresh_token,
              grant_type: 'refresh_token',
            });
            accessToken = refreshResponse.data.access_token;
            this.logger.log('Retrying folder validation with fresh access token.');
            await axios.get(url, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });
          } else {
            throw getErr;
          }
        } else {
          throw getErr;
        }
      }
    } catch (error: any) {
      const status = error.response?.status;
      const details = error.response?.data?.error?.message || error.message;
      this.logger.error(`Folder ID ${folderId} validation failed (status ${status}): ${details}`);
      if (status === 404) {
        throw new Error(`Google Drive folder ID "${folderId}" does not exist or is not found.`);
      } else if (status === 403) {
        throw new Error(`Access Denied: Google Drive folder ID "${folderId}" is not shared with the platform credentials.`);
      } else {
        throw new Error(`Failed to validate folder ID "${folderId}": ${details}`);
      }
    }
  }

  private extractFolderIdFromLink(link: string): string {
    if (!link) return '';
    const trimmed = link.trim();
    const foldersRegex = /\/folders\/([a-zA-Z0-9_-]{5,100})/;
    const foldersMatch = trimmed.match(foldersRegex);
    if (foldersMatch) {
      return foldersMatch[1];
    }
    const idParamRegex = /[?&]id=([a-zA-Z0-9_-]{5,100})/;
    const idParamMatch = trimmed.match(idParamRegex);
    if (idParamMatch) {
      return idParamMatch[1];
    }
    if (/^[a-zA-Z0-9_-]{5,100}$/.test(trimmed)) {
      return trimmed;
    }
    return '';
  }
}
