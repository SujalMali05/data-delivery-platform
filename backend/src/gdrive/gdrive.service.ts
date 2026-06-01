import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RcloneService } from '../rclone/rclone.service';
import { RcloneConfigService } from '../rclone/rclone-config.service';

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
        serviceAccountConfigured: !!this.configService.get('GOOGLE_SERVICE_ACCOUNT_FILE'),
      };
    } catch {
      return {
        rcloneConnected: false,
        serviceAccountConfigured: false,
      };
    }
  }

  async onApplicationBootstrap() {
    this.logger.log('Verifying global Google Drive sources...');
    try {
      await this.prisma.googleDriveSource.upsert({
        where: { id: 'GLOBAL_SERVICE_ACCOUNT' },
        update: {},
        create: {
          id: 'GLOBAL_SERVICE_ACCOUNT',
          name: 'Global Service Account',
          drivePath: '',
          authType: 'SERVICE_ACCOUNT',
        },
      });

      await this.prisma.googleDriveSource.upsert({
        where: { id: 'GLOBAL_OAUTH' },
        update: {},
        create: {
          id: 'GLOBAL_OAUTH',
          name: 'Global User Account',
          drivePath: '',
          authType: 'OAUTH',
        },
      });
      this.logger.log('Global Google Drive sources verified.');
    } catch (err: any) {
      this.logger.error(`Failed to verify/seed global Google Drive sources: ${err.message}`);
    }
  }

  /**
   * List saved Google Drive sources
   */
  async getSources() {
    return this.prisma.googleDriveSource.findMany({
      where: {
        NOT: [
          { id: 'GLOBAL_SERVICE_ACCOUNT' },
          { id: 'GLOBAL_OAUTH' },
        ],
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
    const clientSecret = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_SECRET');
    const tokenJson = this.configService.get<string>('GOOGLE_OAUTH_TOKEN');
    if (!clientId || !clientSecret || !tokenJson) {
      throw new Error('OAuth2 credentials (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_TOKEN) are not configured in .env');
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
  }) {
    const authType = data.authType || 'SERVICE_ACCOUNT';

    // Auto-fill OAuth2 creds from env when authType is OAUTH
    let oauthCreds: { clientId: string; clientSecret: string; tokenJson: string } | null = null;
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
        clientId: oauthCreds?.clientId,
        clientSecret: oauthCreds?.clientSecret,
        tokenJson: oauthCreds?.tokenJson,
      },
    });

    this.logger.log(`Google Drive source created: ${source.name} (${source.drivePath}, auth: ${source.authType})`);
    return source;
  }

  /**
   * Delete a Google Drive source
   */
  async deleteSource(id: string) {
    // Delete associated transfers first (cascades snapshots and logs)
    await this.prisma.transfer.deleteMany({
      where: { sourceId: id },
    });

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
  ) {
    const tempJobId = `browse-${Date.now()}`;
    let remoteName = '';

    try {
      if (authType === 'OAUTH') {
        const { clientId, clientSecret, tokenJson } = this.getOAuthCredsFromEnv();
        remoteName = await this.rcloneConfig.createGdriveRemote(tempJobId, {
          authType: 'OAUTH',
          clientId,
          clientSecret,
          tokenJson,
          teamDriveId: sharedDriveId || undefined,
        });
      } else {
        const serviceAccountFile = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_FILE');
        if (!serviceAccountFile) {
          throw new Error('Google Service Account key file is not configured on the platform');
        }
        remoteName = await this.rcloneConfig.createGdriveRemote(tempJobId, {
          serviceAccountFile,
          teamDriveId: sharedDriveId || undefined,
        });
      }

      const response = await this.rcloneService.listDirectory(`${remoteName}:`, path || '');
      
      const list = response.list || [];
      return list
        .filter((item: any) => item.IsDir)
        .map((item: any) => ({
          name: item.Name,
          path: item.Path,
          id: item.ID || null,
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
        const { clientId, clientSecret, tokenJson } = this.getOAuthCredsFromEnv();
        remoteName = await this.rcloneConfig.createGdriveRemote(tempJobId, {
          authType: 'OAUTH',
          clientId,
          clientSecret,
          tokenJson,
          teamDriveId: sharedDriveId || undefined,
        });
      } else {
        const serviceAccountFile = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_FILE');
        if (!serviceAccountFile) {
          throw new Error('Google Service Account key file is not configured on the platform');
        }
        remoteName = await this.rcloneConfig.createGdriveRemote(tempJobId, {
          serviceAccountFile,
          teamDriveId: sharedDriveId || undefined,
        });
      }

      const rcloneFs = path ? `${remoteName}:${path}`.replace(/\/$/, '') : `${remoteName}:`;
      return await this.rcloneService.calculateSize(rcloneFs, '');
    } catch (error: any) {
      this.logger.error(`Error calculating Google Drive size: ${error.message}`);
      throw new Error(`Failed to calculate size: ${error.message}`);
    } finally {
      if (remoteName) {
        await this.rcloneConfig.cleanupRemotes(tempJobId);
      }
    }
  }
}
