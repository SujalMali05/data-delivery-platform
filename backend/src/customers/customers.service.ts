import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { StsService } from '../aws/sts.service';
import { S3ValidatorService } from '../aws/s3-validator.service';
import { RcloneService } from '../rclone/rclone.service';
import { RcloneConfigService } from '../rclone/rclone-config.service';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger('CustomersService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly stsService: StsService,
    private readonly s3Validator: S3ValidatorService,
    private readonly rcloneService: RcloneService,
    private readonly rcloneConfig: RcloneConfigService,
  ) {}

  async findAll() {
    return this.prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { transfers: true },
        },
      },
    });
  }

  async findById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        transfers: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async create(dto: CreateCustomerDto) {
    const customer = await this.prisma.customer.create({
      data: {
        name: dto.name,
        roleArn: dto.roleArn,
        bucketName: dto.bucketName,
        region: dto.region,
        prefixPath: dto.prefixPath || '',
        externalId: dto.externalId,
      },
    });

    this.logger.log(`Customer created: ${customer.name} (${customer.id})`);
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findById(id);

    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        ...dto,
        isValidated: false, // Reset validation on update
      },
    });

    this.logger.log(`Customer updated: ${customer.name}`);
    return customer;
  }

  async delete(id: string) {
    await this.findById(id);

    await this.prisma.customer.delete({ where: { id } });
    this.logger.log(`Customer deleted: ${id}`);
    return { success: true };
  }

  /**
   * Validate access by performing:
   * 1. AssumeRole
   * 2. S3 ListObjects test
   * 3. S3 PutObject test (small test file)
   */
  async validateAccess(id: string) {
    const customer = await this.findById(id);

    try {
      // Step 1: AssumeRole
      this.logger.log(`Validating access for customer: ${customer.name}`);
      const credentials = await this.stsService.assumeRole(
        customer.roleArn,
        customer.externalId || undefined,
      );

      // Step 2: Test S3 list
      await this.s3Validator.testListAccess(
        credentials,
        customer.bucketName,
        customer.region,
        customer.prefixPath,
      );

      // Step 3: Test S3 upload
      await this.s3Validator.testUploadAccess(
        credentials,
        customer.bucketName,
        customer.region,
        customer.prefixPath,
      );

      // Mark as validated
      await this.prisma.customer.update({
        where: { id },
        data: {
          isValidated: true,
          lastValidated: new Date(),
        },
      });

      this.logger.log(`✅ Access validated for customer: ${customer.name}`);

      return {
        success: true,
        message: 'Access validated successfully',
        checks: {
          assumeRole: 'PASSED',
          listObjects: 'PASSED',
          uploadObject: 'PASSED',
        },
      };
    } catch (error: any) {
      this.logger.error(
        `❌ Access validation failed for customer ${customer.name}: ${error.message}`,
      );

      return {
        success: false,
        message: `Validation failed: ${error.message}`,
        checks: {
          assumeRole: error.step === 'assumeRole' ? 'FAILED' : 'PASSED',
          listObjects:
            error.step === 'listObjects'
              ? 'FAILED'
              : error.step
                ? 'SKIPPED'
                : 'PASSED',
          uploadObject: error.step === 'uploadObject' ? 'FAILED' : 'SKIPPED',
        },
      };
    }
  }

  /**
   * Browse S3 bucket folders dynamically
   */
  async browseBucket(
    roleArn: string,
    bucketName: string,
    region: string,
    externalId: string | null,
    path: string = '',
  ) {
    const tempJobId = `browse-${Date.now()}`;
    let remoteName = '';

    try {
      this.logger.log(`Assuming customer role for browse: ${roleArn}`);
      const credentials = await this.stsService.assumeRole(
        roleArn,
        externalId || undefined,
      );

      remoteName = await this.rcloneConfig.createS3Remote(
        tempJobId,
        credentials,
        region,
      );

      // Format rclone list path: remoteName:bucket/path
      const rclonePath = `${bucketName}/${path || ''}`.replace(/\/$/, '');
      const response = await this.rcloneService.listDirectory(
        `${remoteName}:`,
        rclonePath,
      );

      const list = response.list || [];
      return list
        .filter((item: any) => item.IsDir)
        .map((item: any) => {
          const relativePath = item.Path.startsWith(bucketName + '/')
            ? item.Path.substring(bucketName.length + 1)
            : item.Path;
          return {
            name: item.Name,
            path: relativePath,
          };
        });
    } catch (error: any) {
      this.logger.error(`Error browsing S3 bucket path: ${error.message}`);
      throw new Error(`Failed to browse S3: ${error.message}`);
    } finally {
      if (remoteName) {
        await this.rcloneConfig.cleanupRemotes(tempJobId);
      }
    }
  }

  /**
   * Calculate recursive size of S3 bucket path dynamically
   */
  async calculateSize(
    roleArn: string,
    bucketName: string,
    region: string,
    externalId: string | null,
    path: string = '',
  ) {
    const tempJobId = `size-${Date.now()}`;
    let remoteName = '';

    try {
      const credentials = await this.stsService.assumeRole(
        roleArn,
        externalId || undefined,
      );

      remoteName = await this.rcloneConfig.createS3Remote(
        tempJobId,
        credentials,
        region,
      );

      const rcloneFs = `${remoteName}:${bucketName}/${path || ''}`.replace(
        /\/$/,
        '',
      );
      return await this.rcloneService.calculateSize(rcloneFs, '');
    } catch (error: any) {
      this.logger.error(`Error calculating S3 size: ${error.message}`);
      throw new Error(`Failed to calculate S3 size: ${error.message}`);
    } finally {
      if (remoteName) {
        await this.rcloneConfig.cleanupRemotes(tempJobId);
      }
    }
  }

  /**
   * List both folders and files inside an S3 bucket path, sorted and paginated
   */
  async listObjects(
    customerId: string,
    path: string = '',
    page: number = 1,
    limit: number = 50,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const tempJobId = `list-objs-${Date.now()}`;
    let remoteName = '';

    try {
      const credentials = await this.stsService.assumeRole(
        customer.roleArn,
        customer.externalId || undefined,
      );

      remoteName = await this.rcloneConfig.createS3Remote(
        tempJobId,
        credentials,
        customer.region,
      );

      // Format rclone list path with prefixPath support: remoteName:bucket/prefix/path
      const basePrefix = customer.prefixPath
        ? customer.prefixPath.trim().replace(/^\/|\/$/g, '')
        : '';
      const searchPath = path ? path.trim().replace(/^\/|\/$/g, '') : '';

      let rclonePath = customer.bucketName;
      if (basePrefix) {
        rclonePath += `/${basePrefix}`;
      }
      if (searchPath) {
        rclonePath += `/${searchPath}`;
      }

      const response = await this.rcloneService.listDirectory(
        `${remoteName}:`,
        rclonePath,
      );

      const list = response.list || [];

      let prefixToStrip = customer.bucketName + '/';
      if (basePrefix) {
        prefixToStrip += basePrefix + '/';
      }

      const mappedList = list.map((item: any) => {
        const relativePath = item.Path.startsWith(prefixToStrip)
          ? item.Path.substring(prefixToStrip.length)
          : item.Path.startsWith(customer.bucketName + '/')
            ? item.Path.substring(customer.bucketName.length + 1)
            : item.Path;
        return {
          name: item.Name,
          path: relativePath,
          isDir: item.IsDir,
          size: item.Size || 0,
          modTime: item.ModTime || null,
        };
      });

      // Sort: Directories first, then files alphabetically
      mappedList.sort((a: any, b: any) => {
        if (a.isDir !== b.isDir) {
          return a.isDir ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      const total = mappedList.length;
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const items = mappedList.slice(startIndex, endIndex);

      return {
        items,
        total,
        page,
        limit,
      };
    } catch (error: any) {
      this.logger.error(`Error listing S3 objects: ${error.message}`);
      throw new Error(`Failed to list S3 objects: ${error.message}`);
    } finally {
      if (remoteName) {
        await this.rcloneConfig.cleanupRemotes(tempJobId);
      }
    }
  }

  /**
   * Calculate cumulative audio duration for all WAV files recursively inside an S3 path
   */
  async calculateWavDuration(
    roleArn: string,
    bucketName: string,
    region: string,
    externalId: string | null,
    path: string = '',
    onProgress?: (progress: {
      scanned: number;
      total: number;
      currentFile: string;
    }) => void,
  ) {
    const tempJobId = `wav-duration-${Date.now()}`;
    let remoteName = '';

    try {
      this.logger.log(`Assuming customer role for WAV duration: ${roleArn}`);
      const credentials = await this.stsService.assumeRole(
        roleArn,
        externalId || undefined,
      );

      remoteName = await this.rcloneConfig.createS3Remote(
        tempJobId,
        credentials,
        region,
      );

      const rclonePath = `${bucketName}/${path || ''}`.replace(/\/$/, '');
      return await this.rcloneService.calculateWavDurationOfPath(
        `${remoteName}:`,
        rclonePath,
        onProgress,
      );
    } catch (error: any) {
      this.logger.error(`Error calculating S3 WAV duration: ${error.message}`);
      throw new Error(`Failed to calculate S3 WAV duration: ${error.message}`);
    } finally {
      if (remoteName) {
        await this.rcloneConfig.cleanupRemotes(tempJobId);
      }
    }
  }
}
