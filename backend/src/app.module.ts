import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { GdriveModule } from './gdrive/gdrive.module';
import { TransfersModule } from './transfers/transfers.module';
import { RcloneModule } from './rclone/rclone.module';
import { AwsModule } from './aws/aws.module';
import { QueueModule } from './queue/queue.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { NotificationsModule } from './notifications/notifications.module';
import { LogsModule } from './logs/logs.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ValidationModule } from './validation/validation.module';

@Module({
  imports: [
    // ── Configuration ─────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ── Rate Limiting ─────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // ── BullMQ Queue ──────────────────────────────
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),

    // ── Scheduler ─────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Core Modules ──────────────────────────────
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    GdriveModule,
    TransfersModule,
    RcloneModule,
    AwsModule,
    QueueModule,
    SchedulerModule,
    NotificationsModule,
    LogsModule,
    DashboardModule,
    ValidationModule,
  ],
})
export class AppModule {}
