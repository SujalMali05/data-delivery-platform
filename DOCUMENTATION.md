# DataBridge — Data Delivery Platform

## Comprehensive Technical Documentation

> **Version:** 1.0  
> **Last Updated:** June 2026  
> **Platform Name:** DataBridge (internally `data-delivery-platform`)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Infrastructure & Services (Docker)](#5-infrastructure--services-docker)
6. [Backend — NestJS API](#6-backend--nestjs-api)
   - 6.1 [Module Overview](#61-module-overview)
   - 6.2 [Authentication & Authorization](#62-authentication--authorization)
   - 6.3 [Customer Management](#63-customer-management)
   - 6.4 [Google Drive Integration](#64-google-drive-integration)
   - 6.5 [AWS Integration (STS / S3)](#65-aws-integration-sts--s3)
   - 6.6 [rclone Integration](#66-rclone-integration)
   - 6.7 [Transfer Engine](#67-transfer-engine)
   - 6.8 [Folder Validation](#68-folder-validation)
   - 6.9 [Scheduling System](#69-scheduling-system)
   - 6.10 [Notifications](#610-notifications)
   - 6.11 [Dashboard & Analytics](#611-dashboard--analytics)
   - 6.12 [Logging & Audit Trail](#612-logging--audit-trail)
   - 6.13 [Queue System (BullMQ)](#613-queue-system-bullmq)
   - 6.14 [Real-Time Events (SSE)](#614-real-time-events-sse)
7. [Frontend — Next.js Dashboard](#7-frontend--nextjs-dashboard)
   - 7.1 [Pages & Navigation Menu](#71-pages--navigation-menu)
   - 7.2 [Overview Dashboard](#72-overview-dashboard)
   - 7.3 [Transfers Page](#73-transfers-page)
   - 7.4 [Customers Page](#74-customers-page)
   - 7.5 [Google Drive Page](#75-google-drive-page)
   - 7.6 [Size Calculator](#76-size-calculator)
   - 7.7 [S3 Browser](#77-s3-browser)
   - 7.8 [Folder Validation](#78-folder-validation)
   - 7.9 [Schedules](#79-schedules)
   - 7.10 [Logs](#710-logs)
   - 7.11 [Settings](#711-settings)
8. [Database Schema (Prisma / PostgreSQL)](#8-database-schema-prisma--postgresql)
9. [Configuration Reference (.env)](#9-configuration-reference-env)
10. [AWS Setup Guide](#10-aws-setup-guide)
11. [Google Drive Setup Guide](#11-google-drive-setup-guide)
12. [Transfer Workflow (End-to-End)](#12-transfer-workflow-end-to-end)
13. [Security Considerations](#13-security-considerations)
14. [Deployment Guide](#14-deployment-guide)

---

## 1. Overview

**DataBridge** is a full-stack web application designed to securely transfer large datasets between **Google Drive** and **AWS S3** across multiple customer AWS accounts. It provides an enterprise-grade dashboard for managing, monitoring, and validating data transfers.

### Key Capabilities

| Capability | Description |
|---|---|
| **Multi-Customer S3 Access** | Assumes cross-account IAM roles (with optional role chaining) to write data into customer S3 buckets |
| **Google Drive Support** | Service Account and OAuth2 authentication, supports both My Drive and Shared Drives |
| **Bi-Directional Transfers** | PUSH (Google Drive → S3) and PULL (S3 → Google Drive) transfers |
| **Real-Time Monitoring** | Live transfer progress via Server-Sent Events (SSE) with speed, ETA, file counts |
| **Transfer Modes** | Copy (add new files) and Sync (mirror source exactly) |
| **Folder Validation** | Post-transfer integrity checks comparing source and destination file lists |
| **Size Calculator** | Calculate folder sizes on both Google Drive and S3 before initiating transfers |
| **S3 Browser** | Browse customer S3 bucket contents (files and folders) directly from the UI |
| **Scheduling** | One-time scheduled transfers, daily/weekly recurring via cron expressions |
| **Deduplication** | Google Drive file deduplication using rclone's dedupe engine |
| **Notifications** | Email (SMTP), Slack webhook, and Telegram bot notifications |
| **Audit Logging** | Full audit trail of all user actions with timestamps and metadata |
| **Dark/Light Theme** | User-selectable UI theme with persistent preference |

---

## 2. Architecture

```
┌─────────────────────┐       ┌─────────────────────────────┐
│   Next.js Frontend  │◄─────►│   NestJS Backend API (:4000) │
│     (:3000)         │  HTTP │                               │
│   React 19 + TW4    │  /SSE │   ┌───────────┐ ┌──────────┐ │
└─────────────────────┘       │   │ BullMQ    │ │ Prisma   │ │
                              │   │ Workers   │ │ ORM      │ │
                              │   └─────┬─────┘ └────┬─────┘ │
                              │         │            │       │
                              └─────────┼────────────┼───────┘
                                        │            │
                   ┌────────────────────┼────────────┼────────────────────┐
                   │                    │            │                    │
          ┌────────▼────────┐  ┌────────▼────────┐  │   ┌────────────────▼──┐
          │  Redis (:6379)  │  │ PostgreSQL      │  │   │  rclone RC Daemon │
          │  Queue + Cache  │  │ (:5432)         │  │   │  (:5572)          │
          └─────────────────┘  │ Database        │  │   │  HTTP API          │
                               └─────────────────┘  │   └────────┬──────────┘
                                                     │            │
                                              ┌──────┴──────┐     │
                                              │  AWS STS     │     │
                                              │  AssumeRole  │     │
                                              └──────┬───────┘     │
                                                     │             │
                                     ┌───────────────┼─────────────┼─────────────┐
                                     │               │             │             │
                              ┌──────▼──────┐ ┌──────▼─────┐ ┌────▼───────────┐
                              │ Customer    │ │ Google     │ │ Google Drive   │
                              │ S3 Bucket   │ │ Drive      │ │ (Service Acct  │
                              │ (via IAM    │ │ (OAuth2)   │ │  or OAuth2)    │
                              │  Role)      │ │            │ │                │
                              └─────────────┘ └────────────┘ └────────────────┘
```

### Data Flow

1. **User** creates a Transfer via the frontend dashboard
2. **Backend** enqueues the job into BullMQ (Redis-backed)
3. **Transfer Processor** (BullMQ worker):
   - Calls **AWS STS AssumeRole** to get temporary credentials for the customer's S3 bucket
   - Creates temporary **rclone remotes** (Google Drive + S3) via the rclone RC HTTP API
   - Starts an async rclone copy/sync operation
   - **Polls** rclone for progress every 3 seconds
   - **Refreshes** STS credentials every 50 minutes for long-running transfers
   - **Broadcasts** live progress via SSE to connected dashboard clients
   - Stores progress snapshots every 30 seconds for chart visualization
4. **On completion**: Cleans up temporary remotes, updates status, triggers notifications

---

## 3. Technology Stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | 20+ | Runtime |
| **NestJS** | 11.x | Backend framework (modular, injectable, decorators) |
| **Prisma** | 6.x | ORM / Database access layer |
| **PostgreSQL** | 16 (Alpine) | Primary relational database |
| **Redis** | 7 (Alpine) | Job queue backend (BullMQ) |
| **BullMQ** | 5.x | Distributed job/task queue |
| **rclone** | Latest | Cloud storage transfer engine (via RC HTTP API) |
| **AWS SDK v3** | 3.x | STS AssumeRole, S3 operations |
| **Passport + JWT** | 11.x / 0.7 | Authentication middleware |
| **Nodemailer** | 8.x | Email notifications |
| **Axios** | 1.x | HTTP client (rclone RC, Slack/Telegram) |
| **bcrypt** | 6.x | Password hashing |
| **TypeScript** | 5.x | Language |

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 16.x | React framework (App Router) |
| **React** | 19.x | UI library |
| **Tailwind CSS** | 4.x | Utility-first CSS framework |
| **Lucide React** | 1.x | Icon library |
| **Recharts** | 3.x | Data visualization / charts |
| **Axios** | 1.x | HTTP client |

### Infrastructure (Docker Compose)

| Service | Image | Port | Purpose |
|---|---|---|---|
| `ddp-postgres` | `postgres:16-alpine` | 5432 | Database |
| `ddp-redis` | `redis:7-alpine` | 6379 | Job queue |
| `ddp-rclone` | `rclone/rclone:latest` | 5572 | Transfer engine RC daemon |

---

## 4. Project Structure

```
data-delivery-platform/
├── docker-compose.yml           # Infrastructure services (PostgreSQL, Redis, rclone)
├── .gitignore
│
├── backend/                     # NestJS API Server
│   ├── .env                     # Environment configuration
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   └── schema.prisma        # Database schema definition
│   └── src/
│       ├── main.ts              # Application bootstrap
│       ├── app.module.ts        # Root module (imports all feature modules)
│       ├── auth/                # Authentication (JWT, login, register, seed)
│       ├── users/               # User management
│       ├── customers/           # Customer CRUD + S3 validation + S3 browsing
│       ├── gdrive/              # Google Drive sources, browsing, size calc, dedupe
│       ├── aws/                 # STS AssumeRole + S3 validation service
│       ├── rclone/              # rclone RC API client + dynamic remote management
│       ├── transfers/           # Transfer CRUD, lifecycle, SSE events
│       ├── validation/          # Folder validation (source vs destination comparison)
│       ├── queue/               # BullMQ queue constants, transfer processor, validation processor
│       ├── scheduler/           # Cron-based scheduled transfers + cleanup
│       ├── notifications/       # Email, Slack, Telegram notification channels
│       ├── logs/                # Transfer log query endpoints
│       ├── dashboard/           # Dashboard metrics + throughput data
│       ├── prisma/              # Prisma module (injectable PrismaService)
│       └── common/              # Shared filters, guards, decorators
│
├── frontend/                    # Next.js Dashboard
│   ├── package.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx       # Root layout
│       │   ├── globals.css      # Global CSS with CSS variables (dark/light theme)
│       │   ├── login/           # Login page
│       │   ├── page.tsx         # Root redirect
│       │   └── dashboard/
│       │       ├── layout.tsx   # Dashboard shell (sidebar menu, breadcrumbs, theme toggle)
│       │       ├── page.tsx     # Overview dashboard
│       │       ├── transfers/   # Transfer list + create + detail pages
│       │       ├── customers/   # Customer management pages
│       │       ├── gdrive/      # Google Drive source management
│       │       ├── calculator/  # Size calculator
│       │       ├── s3-browser/  # S3 bucket file browser
│       │       ├── validation/  # Folder validation pages
│       │       ├── schedules/   # Scheduled transfers
│       │       ├── logs/        # Transfer logs viewer
│       │       └── settings/    # Application settings
│       ├── components/
│       │   └── FolderBrowser.tsx # Reusable folder browser component
│       ├── hooks/               # Custom React hooks
│       └── lib/                 # Utility functions, API client
│
├── nginx/                       # Nginx reverse proxy config (production)
└── rclone-config/               # rclone configuration directory (mounted into Docker)
    └── service-account.json     # Google Service Account key file
```

---

## 5. Infrastructure & Services (Docker)

The platform runs three infrastructure services via Docker Compose:

### PostgreSQL Database

```yaml
postgres:
  image: postgres:16-alpine
  container_name: ddp-postgres
  ports: ["5432:5432"]
  environment:
    POSTGRES_USER: ddp_user
    POSTGRES_PASSWORD: ddp_secret_2024
    POSTGRES_DB: data_delivery_platform
  volumes:
    - postgres_data:/var/lib/postgresql/data
```

- Persistent storage via Docker volume
- Health check: `pg_isready` command every 10 seconds

### Redis (Queue + Cache)

```yaml
redis:
  image: redis:7-alpine
  container_name: ddp-redis
  ports: ["6379:6379"]
  command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
```

- Append-only persistence enabled
- 512MB memory limit with LRU eviction
- Powers BullMQ job queues

### rclone RC Daemon

```yaml
rclone:
  image: rclone/rclone:latest
  container_name: ddp-rclone
  ports: ["5572:5572"]
  command: rcd --rc-addr=0.0.0.0:5572 --rc-no-auth --log-level=INFO --log-file=/logs/rclone.log
  volumes:
    - ./rclone-config:/config/rclone    # Mounts service account JSON
    - rclone_logs:/logs
    - rclone_temp:/tmp/rclone
```

- Runs in **RC (Remote Control) daemon mode** — exposes an HTTP API on port 5572
- No authentication (internal network only)
- Service account key file mounted from `./rclone-config/`
- Log files persisted to named volume

---

## 6. Backend — NestJS API

The backend runs on **port 4000** with global prefix `/api`. All API endpoints are protected by JWT authentication (except `/api/auth/login` and `/api/auth/register`).

### 6.1 Module Overview

The `AppModule` imports the following feature modules:

| Module | Purpose |
|---|---|
| `ConfigModule` | Global `.env` configuration (via `@nestjs/config`) |
| `ThrottlerModule` | Rate limiting: 10 requests/second, 100 requests/minute |
| `BullModule` | BullMQ Redis connection for job queues |
| `ScheduleModule` | Cron-based task scheduling |
| `PrismaModule` | Database ORM (injectable `PrismaService`) |
| `AuthModule` | JWT authentication, login, register, admin seed |
| `UsersModule` | User CRUD |
| `CustomersModule` | Customer CRUD, S3 access validation, S3 browsing |
| `GdriveModule` | Google Drive source management, folder browsing, size calculation, deduplication |
| `TransfersModule` | Transfer lifecycle management, SSE streaming |
| `RcloneModule` | rclone RC HTTP client, dynamic remote creation |
| `AwsModule` | AWS STS AssumeRole, S3 validation |
| `QueueModule` | BullMQ processor registration (transfer + validation workers) |
| `SchedulerModule` | Cron jobs for scheduled transfers and cleanup |
| `NotificationsModule` | Multi-channel notification dispatch |
| `LogsModule` | Transfer log querying |
| `DashboardModule` | Dashboard metrics and throughput analytics |
| `ValidationModule` | Folder validation jobs |

### 6.2 Authentication & Authorization

**File:** `backend/src/auth/`

- **Strategy**: JWT (JSON Web Token) via `@nestjs/passport` and `passport-jwt`
- **Password Hashing**: `bcrypt` with 12 salt rounds
- **Token Expiration**: 24 hours (configurable via `JWT_EXPIRATION`)
- **User Roles**: `ADMIN` and `OPERATOR`
- **Admin Seeding**: On first application start (when no users exist), an admin user is automatically created using environment variables `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Authenticate user, return JWT |
| POST | `/api/auth/register` | Register new user |
| GET | `/api/auth/profile` | Get current user profile |

**Login Request:**
```json
{
  "email": "admin@yourcompany.com",
  "password": "ChangeMe123!"
}
```

**Login Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1...",
  "user": {
    "id": "uuid",
    "email": "admin@yourcompany.com",
    "name": "Admin",
    "role": "ADMIN"
  }
}
```

### 6.3 Customer Management

**File:** `backend/src/customers/`

Customers represent **external AWS accounts** whose S3 buckets are the transfer destinations. Each customer stores:

- **Name**: Display name
- **Role ARN**: The IAM role ARN in the customer's AWS account that DataBridge will assume
- **Bucket Name**: Target S3 bucket name
- **Region**: AWS region (default: `ap-south-1`)
- **Prefix Path**: Optional path prefix within the bucket (e.g., `data/incoming/`)
- **External ID**: Optional security parameter for STS AssumeRole
- **Validation Status**: Whether S3 access has been tested and confirmed

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/customers` | List all customers |
| GET | `/api/customers/:id` | Get customer details |
| POST | `/api/customers` | Create new customer |
| PUT | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer (cascades transfers) |
| POST | `/api/customers/:id/validate` | Validate S3 access (AssumeRole + List + Upload test) |
| POST | `/api/customers/browse` | Browse S3 bucket folders |
| POST | `/api/customers/:id/objects` | List S3 objects (files + folders) with pagination |
| POST | `/api/customers/size` | Calculate S3 folder size |

**Access Validation Flow:**

1. **AssumeRole** — Tests that the role ARN can be assumed (with optional role chaining through an operational role)
2. **ListObjects** — Tests read access to the specified bucket/prefix
3. **PutObject + DeleteObject** — Tests write access by uploading and cleaning up a small test file

Returns detailed per-step pass/fail status:
```json
{
  "success": true,
  "checks": {
    "assumeRole": "PASSED",
    "listObjects": "PASSED",
    "uploadObject": "PASSED"
  }
}
```

### 6.4 Google Drive Integration

**File:** `backend/src/gdrive/`

Google Drive sources define the source folders for transfers. The platform supports two authentication modes:

#### Authentication Modes

| Mode | Description | Use Case |
|---|---|---|
| **SERVICE_ACCOUNT** | Uses a Google Service Account JSON key file | Shared Drives, files shared with the service account |
| **OAUTH** | Uses OAuth2 client credentials and user token | Personal "My Drive", write operations (Pull transfers) |

#### Global Sources

On application startup, two built-in sources are automatically created:

- `GLOBAL_SERVICE_ACCOUNT` — Uses the service account configured in the environment
- `GLOBAL_OAUTH` — Uses the OAuth2 credentials configured in the environment

These allow quick transfers without creating custom sources.

#### Custom Sources

Users can create custom Google Drive sources with:
- **Name**: Display name
- **Drive Path**: Root folder path in Google Drive
- **Drive Type**: `MY_DRIVE` or `SHARED_DRIVE`
- **Shared Drive ID**: Required for Shared Drive access
- **Auth Type**: `SERVICE_ACCOUNT` or `OAUTH`

For OAuth sources, credentials are automatically populated from the environment's `GOOGLE_OAUTH_*` variables.

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/gdrive/status` | Check rclone and Google Drive connection status |
| GET | `/api/gdrive/sources` | List all custom Google Drive sources |
| GET | `/api/gdrive/sources/:id` | Get source details |
| POST | `/api/gdrive/sources` | Create a new source |
| DELETE | `/api/gdrive/sources/:id` | Delete a source |
| GET | `/api/gdrive/browse` | Browse Google Drive directories |
| POST | `/api/gdrive/size` | Calculate Google Drive folder size |
| POST | `/api/gdrive/dedupe` | Run deduplication on a Google Drive path |

#### Deduplication

The dedupe feature resolves duplicate files on Google Drive (a common issue when syncing or uploading multiple times). It uses rclone's built-in `dedupe` command with configurable modes:

- **newest**: Keep the newest file, delete older duplicates (default)
- **oldest**: Keep the oldest file
- **rename**: Rename duplicates
- **skip**: Skip and report only

**Important:** Deduplication requires write access (delete permissions). The system automatically **forces OAuth2 authentication** for dedupe operations when environment OAuth credentials are available, because Service Accounts may lack delete permissions on personal "My Drive" folders.

### 6.5 AWS Integration (STS / S3)

**File:** `backend/src/aws/`

#### STS Service (AssumeRole)

The platform uses **AWS STS (Security Token Service)** to obtain temporary credentials for accessing customer S3 buckets. This follows AWS cross-account access best practices.

**Role Chaining Support:**

DataBridge supports a **two-step role chaining** pattern:

1. **Step 1 — Assume Operational Role**: The platform first assumes an intermediate "operational role" (`AWS_OPERATIONAL_ROLE_ARN`) within its own AWS account
2. **Step 2 — Assume Customer Role**: Using the operational role's credentials, it then assumes the customer's cross-account role

This adds an extra layer of security — the platform's base credentials only need permission to assume the operational role, not all customer roles.

```
IAM User (base credentials)
  └─► AssumeRole: rclone-transfer-role (operational)
        └─► AssumeRole: customer-role-arn (cross-account)
              └─► Temporary S3 credentials
```

**Credential Configuration:**

| Variable | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user access key (optional on EC2 with Instance Profile) |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `AWS_REGION` | Default AWS region (e.g., `ap-south-1`) |
| `AWS_OPERATIONAL_ROLE_ARN` | Intermediate operational role for role chaining |

#### S3 Validator Service

Performs automated access tests on customer S3 buckets:
- **ListObjects test**: Validates read access
- **PutObject + DeleteObject test**: Validates write access using a temporary test file

### 6.6 rclone Integration

**File:** `backend/src/rclone/`

rclone is the core transfer engine. The backend communicates with the rclone daemon via its **RC (Remote Control) HTTP API** on port 5572.

#### RcloneService

Low-level HTTP client for the rclone RC API:

| Method | rclone API | Description |
|---|---|---|
| `healthCheck()` | `POST /core/version` | Verify rclone daemon is running |
| `createRemote()` | `POST /config/create` + `/config/update` | Create a new remote dynamically |
| `deleteRemote()` | `POST /config/delete` | Remove a remote |
| `startTransfer()` | `POST /sync/{copy,sync,move}` | Start async transfer job |
| `getStats()` | `POST /core/stats` | Get transfer statistics |
| `getJobStatus()` | `POST /job/status` | Check if a job is running/finished |
| `stopJob()` | `POST /job/stop` | Cancel a running job |
| `listJobs()` | `POST /job/list` | List all rclone jobs |
| `listDirectory()` | `POST /operations/list` | List files/folders on a remote |
| `calculateSize()` | `POST /operations/size` | Calculate recursive folder size |
| `dedupe()` | `POST /core/command` | Run deduplication |
| `updateRemoteCredentials()` | `POST /config/update` | Refresh credentials in-memory |
| `resetStats()` | `POST /core/stats-reset` | Reset stats for a transfer group |

**Transfer Performance Optimizations:**

All transfers are configured with these performance flags:
- `--buffer-size 64M` — Larger memory buffer
- `--drive-chunk-size 64M` — Larger Google Drive upload chunks
- `--s3-upload-cutoff 64M` — S3 multipart upload threshold
- `--s3-chunk-size 64M` — S3 multipart chunk size
- `--fast-list` — Use fewer API calls for listing

#### RcloneConfigService

Higher-level service for managing transfer-specific remotes:

- **`createGdriveRemote(jobId, options)`**: Creates a Google Drive remote with Service Account or OAuth2 authentication
- **`createS3Remote(jobId, credentials, region)`**: Creates an S3 remote with temporary STS credentials
- **`refreshS3Credentials(jobId, credentials)`**: Hot-swaps credentials for long-running transfers
- **`cleanupRemotes(jobId)`**: Deletes both remotes and resets stats after job completion

**OAuth2 Remote Creation (Two-Step):**

Creating a Google Drive remote with OAuth2 tokens requires a special two-step approach because rclone's `/config/create` triggers an interactive OAuth browser flow. DataBridge bypasses this:

1. Create a skeleton remote with `nonInteractive: true` (may partially fail — expected)
2. Overwrite with real parameters via `/config/update` (sets token directly)

### 6.7 Transfer Engine

**Files:** `backend/src/transfers/` and `backend/src/queue/transfer.processor.ts`

The transfer engine is the core of the platform. It handles the complete lifecycle of data transfers.

#### Transfer Model

| Field | Type | Description |
|---|---|---|
| `name` | String | Human-readable transfer name |
| `direction` | Enum | `PUSH` (GDrive→S3) or `PULL` (S3→GDrive) |
| `mode` | Enum | `COPY` or `SYNC` |
| `status` | Enum | `QUEUED`, `RUNNING`, `PAUSED`, `COMPLETED`, `FAILED`, `CANCELLED`, `RETRYING`, `SCHEDULED` |
| `sourceId` | String | Google Drive source reference |
| `customerId` | String | Customer (S3 destination) reference |
| `destinationPath` | String | Destination path within S3 bucket |
| `concurrency` | Int | Parallel transfer streams (default: 6) |
| `checkers` | Int | Parallel file checkers (default: 32) |
| `retries` | Int | Maximum retry attempts (default: 50) |
| `bandwidthLimit` | String? | Optional bandwidth throttle (e.g., `10M`) |
| `totalBytes` | BigInt | Total bytes to transfer |
| `transferredBytes` | BigInt | Bytes transferred so far |
| `totalFiles` | Int | Total file count |
| `transferredFiles` | Int | Files transferred so far |
| `currentSpeed` | String? | Current transfer speed (e.g., `45.3 MB/s`) |
| `eta` | String? | Estimated time remaining (e.g., `2h 15m`) |
| `rcloneJobId` | Int? | Active rclone job identifier |
| `rcloneGroup` | String? | rclone stats group name |
| `scheduledAt` | DateTime? | Scheduled start time |
| `scheduleType` | Enum? | `ONE_TIME`, `DAILY`, `WEEKLY` |
| `cronExpression` | String? | Cron expression for recurring |

#### Transfer Lifecycle

```
PAUSED ──► QUEUED ──► RUNNING ──► COMPLETED
                         │            ▲
                         │            │
                         ▼            │
                       PAUSED    RETRYING
                         │
                         ▼
                       FAILED ───► QUEUED (retry)
                         │
                       CANCELLED
```

#### Launch Modes

| Mode | Behavior |
|---|---|
| `START` | Immediately adds transfer to BullMQ execution queue |
| `QUEUE` | Adds to sequential queue — waits for current running transfer to finish |
| `PAUSE` | Creates transfer in `PAUSED` state — must be manually started |

#### Transfer Processor (BullMQ Worker)

The `TransferProcessor` is the heart of the system. It runs as a BullMQ worker with concurrency of 3:

**Step-by-Step Execution:**

1. **Load transfer** from database with customer and source relations
2. **AssumeRole** via STS to get temporary S3 credentials
3. **Check for existing rclone job** — handles server restarts by reconnecting to active background jobs
4. **Create dynamic rclone remotes** (GDrive + S3) with proper authentication
5. **Start rclone transfer** (`copy` / `sync` / `move`) with configured performance options
6. **Monitor progress loop**:
   - Polls rclone stats every 3 seconds
   - Updates database with current progress (bytes, files, speed, ETA)
   - Broadcasts progress via SSE to connected clients
   - Stores progress snapshots every 30 seconds (for charts)
   - Refreshes STS credentials every 50 minutes
7. **Completion**: Mark as `COMPLETED`, broadcast final SSE event, trigger next queued transfer
8. **Cleanup**: Delete temporary rclone remotes

**Fault Tolerance:**

The processor handles several failure scenarios:

- **Expired STS Token**: Automatically refreshes credentials and retries (up to 5 attempts)
- **Network Disruption**: Waits 30 seconds then retries
- **Server Restart**: On application bootstrap, reconnects to active rclone background jobs
- **User Pause/Cancel**: Detects status changes and exits gracefully

**Resume Progress (Baseline Calculation):**

When a transfer is interrupted and resumed, the processor calculates a baseline from the database to prevent double-counting:

```
absoluteProgress = databaseBaseline + currentRcloneStats
```

#### Transfer API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/transfers` | List transfers (paginated, filterable by status) |
| GET | `/api/transfers/:id` | Get transfer details |
| POST | `/api/transfers` | Create new transfer |
| POST | `/api/transfers/:id/start` | Start/resume transfer immediately |
| POST | `/api/transfers/:id/queue` | Add to sequential queue |
| POST | `/api/transfers/:id/pause` | Pause running transfer |
| POST | `/api/transfers/:id/stop` | Cancel transfer |
| POST | `/api/transfers/:id/retry` | Retry failed transfer |
| DELETE | `/api/transfers/:id` | Delete transfer |
| GET | `/api/transfers/:id/snapshots` | Get progress snapshots (for charts) |
| GET | `/api/transfers/:id/events` | SSE stream for live progress |
| GET | `/api/transfers/events/all` | SSE stream for all transfers |

### 6.8 Folder Validation

**File:** `backend/src/validation/`

Folder validation compares files between a Google Drive source and an S3 destination after a transfer to verify data integrity.

#### Validation Model

| Field | Description |
|---|---|
| `name` | Validation name (auto-versioned: `name`, `name-V1`, `name-V2`, ...) |
| `sourceId` | Google Drive source |
| `sourcePath` | Source folder path |
| `customerId` | Customer (S3 destination) |
| `destinationPath` | Destination folder path |
| `oneWay` | If true, only checks files missing on destination |
| `srcTotalBytes/Files` | Source side counts |
| `dstTotalBytes/Files` | Destination side counts |
| `matchCount` | Files that match |
| `differCount` | Files that differ (size mismatch) |
| `missingSrcCount` | Files missing from source |
| `missingDstCount` | Files missing from destination |
| `reportPath` | Path to detailed JSON report on disk |

#### Auto-Versioning

When creating validations with the same name, the system automatically appends version suffixes:
- First: `My Validation`
- Second: `My Validation-V1`
- Third: `My Validation-V2`

The versioning logic uses regex parsing against existing validation names in the database.

#### Validation Processor

The validation job runs via BullMQ and uses rclone's `operations/check` command to compare source and destination file lists. Results are stored in a JSON report file.

### 6.9 Scheduling System

**File:** `backend/src/scheduler/`

- **Scheduled Transfers**: Transfers can be set with a `scheduledAt` timestamp and `scheduleType`
- **Cron Check**: Every minute, a cron job checks for `SCHEDULED` transfers whose `scheduledAt` time has passed and promotes them to `QUEUED`
- **Snapshot Cleanup**: A daily job at 3 AM deletes progress snapshots older than 30 days to manage storage

### 6.10 Notifications

**File:** `backend/src/notifications/`

The notification system supports three channels:

| Channel | Configuration | Trigger Events |
|---|---|---|
| **Email** | SMTP server credentials (`SMTP_HOST`, `SMTP_PORT`, etc.) | Transfer complete, failed |
| **Slack** | Webhook URL (`SLACK_WEBHOOK_URL`) | Transfer complete, failed |
| **Telegram** | Bot token + Chat ID (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) | Transfer complete, failed |

All channels are notified in parallel using `Promise.allSettled` (failure in one channel doesn't block others).

### 6.11 Dashboard & Analytics

**File:** `backend/src/dashboard/`

**Overview Metrics:**
- Running transfers count
- Queued transfers count
- Failed transfers count
- Completed transfers count
- Total data transferred (sum of all transferredBytes)
- Last 10 recent transfers with details

**Throughput Chart:**
- Returns progress snapshots from the last 24 hours
- Each data point includes: speed, bytesTransferred, timestamp, transfer name

### 6.12 Logging & Audit Trail

**Transfer Logs** — Per-transfer event logs with levels:
- `INFO`: Transfer started, credentials refreshed, completed
- `WARN`: Credential expiry, network disruption
- `ERROR`: Transfer failures

**Audit Logs** — System-wide user action tracking:
- User ID, action, resource type, resource ID
- Metadata (JSON), IP address, timestamp

### 6.13 Queue System (BullMQ)

The platform uses five named queues:

| Queue | Purpose |
|---|---|
| `transfer-queue` | Main transfer execution |
| `validation-queue` | Folder validation jobs |
| `credential-refresh-queue` | STS credential rotation |
| `notification-queue` | Notification dispatch |
| `scheduled-transfer-queue` | Scheduled transfer triggers |

**Key Timing Constants:**

| Constant | Value | Purpose |
|---|---|---|
| `PROGRESS_POLL_INTERVAL_MS` | 3,000 ms | How often to poll rclone for stats |
| `SNAPSHOT_INTERVAL_MS` | 30,000 ms | How often to store progress snapshots |
| `CREDENTIAL_REFRESH_INTERVAL_MS` | 3,000,000 ms (50 min) | How often to refresh STS credentials |

### 6.14 Real-Time Events (SSE)

**File:** `backend/src/transfers/transfer-events.service.ts`

Transfer progress is broadcast in real-time using **Server-Sent Events (SSE)**:

- **Per-Transfer Stream**: `GET /api/transfers/:id/events` — Used on the transfer detail page
- **All-Transfers Stream**: `GET /api/transfers/events/all` — Used on the dashboard overview

Implementation uses RxJS `Subject` as an internal event bus with `filter` and `map` operators for per-transfer filtering.

**SSE Event Payload:**
```json
{
  "transferredBytes": 1073741824,
  "totalBytes": 5368709120,
  "transferredFiles": 142,
  "totalFiles": 500,
  "errorCount": 0,
  "speed": "45.3 MB/s",
  "eta": "2h 15m",
  "status": "RUNNING"
}
```

---

## 7. Frontend — Next.js Dashboard

### 7.1 Pages & Navigation Menu

The sidebar navigation is organized into groups:

```
📊 Overview                     (Dashboard home)

─── DATA TRANSFER ─────────────
↔️  Transfers                    (Manage transfer jobs)
👥 Customers                    (Manage AWS customer accounts)
💾 Google Drive                 (Manage Google Drive sources)

─── UTILITIES & SYSTEM ────────
🧮 Size Calculator              (Calculate folder sizes)
🗄️  S3 Browser                   (Browse customer S3 buckets)
✅ Folder Validation            (Compare source vs destination)
📅 Schedules                    (View scheduled transfers)
📜 Logs                         (Transfer activity logs)
⚙️  Settings                     (Application settings)
```

**Theme System:**
- Dark and Light mode with CSS custom properties
- Persisted in `localStorage` (`ddp_theme`)
- Toggle button in the top header bar

### 7.2 Overview Dashboard

- **Metric Cards**: Running, Queued, Failed, Completed counts with animated counters
- **Total Data Transferred**: Formatted in human-readable units (GB, TB)
- **Recent Transfers Table**: Last 10 transfers with status badges, progress bars, speed, ETA
- **Live Updates**: Connected to SSE `/api/transfers/events/all` for real-time progress

### 7.3 Transfers Page

**List View:**
- Paginated table of all transfers
- Filter by status (All, Running, Queued, Completed, Failed, etc.)
- Status badges with color coding
- Progress bar with percentage
- Actions: Start, Pause, Stop, Retry, Delete

**Create Transfer Form:**
- Source: Select Google Drive source (includes global accounts)
- Customer: Select destination customer
- Direction: PUSH or PULL
- Mode: Copy or Sync
- Destination Path: With S3 folder browser
- Performance Settings: Concurrency (default: 6), Checkers, Retries, Bandwidth Limit
- Launch Mode: Start Now, Queue, or Pause
- Schedule: Optional scheduled start time

**Transfer Detail Page:**
- Real-time progress bar with SSE updates
- Speed and ETA display
- File count progress (e.g., 142 / 500 files)
- Error count
- Transfer timeline/log
- Progress chart (using Recharts)

### 7.4 Customers Page

- Customer list with validation status indicators
- Create/Edit customer form (Name, Role ARN, Bucket, Region, Prefix Path, External ID)
- **Validate Access** button — runs the 3-step S3 validation
- Per-customer transfer history

### 7.5 Google Drive Page

- List of Google Drive sources
- Create source with: Name, Drive Path, Drive Type, Shared Drive ID, Auth Type
- **Interactive Folder Browser** — navigate Google Drive directories tree-style
- Source detail view with recent transfers

### 7.6 Size Calculator

- Select a Google Drive source or customer S3 bucket
- Navigate to a specific folder path
- Calculate total size and file count recursively
- Results displayed in formatted units

### 7.7 S3 Browser

- Select a customer to browse their S3 bucket
- Navigate folders with breadcrumb navigation
- View files with name, size, and modification date
- Paginated listing with sorting (directories first)

### 7.8 Folder Validation

- Create validation by selecting source (GDrive) and destination (S3)
- View validation results: Match count, Differ count, Missing files
- Detailed JSON report view
- Re-validate button for creating versioned follow-up validations

### 7.9 Schedules

- View all scheduled transfers with their scheduled times
- Schedule type display (One-time, Daily, Weekly)
- Cron expression display

### 7.10 Logs

- Transfer log viewer with level filtering (INFO, WARN, ERROR)
- Timestamp and message display
- Per-transfer log detail view

### 7.11 Settings

- Application configuration display
- User management (admin only)

---

## 8. Database Schema (Prisma / PostgreSQL)

### Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Transfer : creates
    User ||--o{ AuditLog : generates
    Customer ||--o{ Transfer : receives
    Customer ||--o{ Validation : validates
    GoogleDriveSource ||--o{ Transfer : sources
    GoogleDriveSource ||--o{ Validation : validates
    Transfer ||--o{ TransferLog : has
    Transfer ||--o{ ProgressSnapshot : tracks

    User {
        uuid id PK
        string email UK
        string passwordHash
        string name
        enum role
        boolean isActive
    }

    Customer {
        uuid id PK
        string name
        string roleArn
        string bucketName
        string region
        string prefixPath
        string externalId
        boolean isValidated
    }

    GoogleDriveSource {
        uuid id PK
        string name
        string drivePath
        enum driveType
        string sharedDriveId
        enum authType
        string clientId
        string clientSecret
        string tokenJson
    }

    Transfer {
        uuid id PK
        string name
        enum direction
        enum status
        enum mode
        bigint totalBytes
        bigint transferredBytes
        int totalFiles
        int transferredFiles
        int rcloneJobId
        string rcloneGroup
        datetime scheduledAt
    }

    TransferLog {
        uuid id PK
        uuid transferId FK
        enum level
        string message
        json metadata
    }

    ProgressSnapshot {
        uuid id PK
        uuid transferId FK
        bigint bytesTransferred
        int filesTransferred
        string speed
        string eta
    }

    Validation {
        uuid id PK
        string name
        enum status
        uuid sourceId FK
        uuid customerId FK
        int matchCount
        int differCount
        int missingSrcCount
        int missingDstCount
    }

    AuditLog {
        uuid id PK
        uuid userId FK
        string action
        string resource
        json details
    }

    NotificationSetting {
        uuid id PK
        enum channel
        json config
        boolean isActive
        string[] events
    }
```

### Database Tables

| Table | Primary Key | Description |
|---|---|---|
| `users` | UUID | Application users (ADMIN/OPERATOR) |
| `customers` | UUID | AWS customer configurations |
| `google_drive_sources` | UUID | Google Drive source definitions |
| `transfers` | UUID | Transfer job records |
| `transfer_logs` | UUID | Per-transfer event logs |
| `progress_snapshots` | UUID | Time-series progress data |
| `validations` | UUID | Folder validation records |
| `audit_logs` | UUID | User action audit trail |
| `notification_settings` | UUID | Notification channel configurations |

### Key Indexes

- `transfers(status)` — Fast status filtering
- `transfers(createdAt)` — Chronological ordering
- `progress_snapshots(transferId, timestamp)` — Efficient snapshot queries
- `transfer_logs(transferId, timestamp)` — Log retrieval
- `transfer_logs(level)` — Level filtering
- `audit_logs(userId, timestamp)` — User activity lookup

---

## 9. Configuration Reference (.env)

```env
# ── Application ────────────────────────────────
NODE_ENV=development                    # Environment: development | production
PORT=4000                               # Backend API port

# ── Database ───────────────────────────────────
DATABASE_URL=postgresql://ddp_user:ddp_secret_2024@localhost:5432/data_delivery_platform?schema=public

# ── Redis ──────────────────────────────────────
REDIS_HOST=localhost                     # Redis host
REDIS_PORT=6379                         # Redis port

# ── JWT ────────────────────────────────────────
JWT_SECRET=dev-jwt-secret-change-in-production-2024   # JWT signing secret
JWT_EXPIRATION=24h                      # Token expiration

# ── rclone RC ──────────────────────────────────
RCLONE_RC_URL=http://localhost:5572     # rclone daemon HTTP API URL

# ── Google Drive (Service Account) ─────────────
GOOGLE_SERVICE_ACCOUNT_FILE=/config/rclone/service-account.json
# GOOGLE_IMPERSONATE_USER=user@yourdomain.com   # Optional domain-wide delegation

# ── Google Drive (OAuth2) ──────────────────────
GOOGLE_OAUTH_CLIENT_ID=<your-oauth-client-id>
GOOGLE_OAUTH_CLIENT_SECRET=<your-oauth-client-secret>
GOOGLE_OAUTH_TOKEN='{"access_token":"...","token_type":"Bearer","refresh_token":"...","expiry":"..."}'

# ── AWS Credentials ────────────────────────────
AWS_ACCESS_KEY_ID=<your-access-key>     # Optional on EC2 (uses Instance Profile)
AWS_SECRET_ACCESS_KEY=<your-secret-key>
AWS_REGION=ap-south-1
AWS_OPERATIONAL_ROLE_ARN=arn:aws:iam::<account-id>:role/rclone-transfer-role

# ── Notifications ──────────────────────────────
SMTP_HOST=                              # SMTP server hostname
SMTP_PORT=587                           # SMTP port
SMTP_USER=                              # SMTP username
SMTP_PASS=                              # SMTP password
SMTP_FROM=                              # Sender email address
SLACK_WEBHOOK_URL=                      # Slack incoming webhook URL
TELEGRAM_BOT_TOKEN=                     # Telegram bot API token
TELEGRAM_CHAT_ID=                       # Telegram chat/group ID

# ── Admin Seed ─────────────────────────────────
ADMIN_EMAIL=admin@yourcompany.com       # Initial admin email
ADMIN_PASSWORD=ChangeMe123!             # Initial admin password
ADMIN_NAME=Admin                        # Initial admin display name
```

---

## 10. AWS Setup Guide

### Prerequisites

1. An **AWS IAM User** (or EC2 Instance Profile) in the DataBridge AWS account
2. An **Operational Role** in the DataBridge account (for role chaining)
3. A **Customer Role** in each customer's AWS account

### Step 1: Create IAM User (DataBridge Account)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::<DATABRIDGE_ACCOUNT>:role/rclone-transfer-role"
    }
  ]
}
```

### Step 2: Create Operational Role (DataBridge Account)

**Trust Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<DATABRIDGE_ACCOUNT>:user/<iam-user>"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

**Permission Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::*:role/*"
    }
  ]
}
```

### Step 3: Create Customer Role (Customer Account)

**Trust Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<DATABRIDGE_ACCOUNT>:role/rclone-transfer-role"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "<optional-external-id>"
        }
      }
    }
  ]
}
```

**Permission Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::<customer-bucket>",
        "arn:aws:s3:::<customer-bucket>/*"
      ]
    }
  ]
}
```

### Step 4: Configure DataBridge

Set the following in `.env`:
```env
AWS_ACCESS_KEY_ID=<iam-user-access-key>
AWS_SECRET_ACCESS_KEY=<iam-user-secret-key>
AWS_REGION=ap-south-1
AWS_OPERATIONAL_ROLE_ARN=arn:aws:iam::<DATABRIDGE_ACCOUNT>:role/rclone-transfer-role
```

### Step 5: Add Customer in DataBridge UI

1. Navigate to **Customers** → **Create**
2. Enter the customer's **Role ARN**, **Bucket Name**, **Region**, and optional **External ID**
3. Click **Validate Access** to run the 3-step verification

---

## 11. Google Drive Setup Guide

### Option A: Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts
2. Create a new service account
3. Generate a JSON key file
4. Place the key file in `./rclone-config/service-account.json`
5. Share the target Google Drive folders with the service account email
6. Set `GOOGLE_SERVICE_ACCOUNT_FILE=/config/rclone/service-account.json` in `.env`

**Limitations:**
- Cannot write to personal "My Drive" (storage quota on service account)
- Cannot delete files from personal "My Drive" (no permission)

### Option B: OAuth2 User Token

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Desktop application type)
3. Enable the **Google Drive API**
4. Use `rclone config` to generate a token:
   ```bash
   rclone config
   # Follow prompts to create a "drive" remote with your OAuth credentials
   # Copy the generated token JSON
   ```
5. Set in `.env`:
   ```env
   GOOGLE_OAUTH_CLIENT_ID=<client-id>
   GOOGLE_OAUTH_CLIENT_SECRET=<client-secret>
   GOOGLE_OAUTH_TOKEN='{"access_token":"...","refresh_token":"...","expiry":"..."}'
   ```

**Benefits:**
- Full access to personal "My Drive"
- Can delete files (needed for deduplication)
- Can upload files (needed for PULL transfers)

### Shared Drive Access

For Shared Drives (Team Drives), create a Google Drive source with:
- `driveType`: `SHARED_DRIVE`
- `sharedDriveId`: The Team Drive ID (found in the Shared Drive URL)

---

## 12. Transfer Workflow (End-to-End)

### 1. Setup Phase

```
[Admin] → Create Customer (Role ARN, Bucket, Region)
        → Validate Access (AssumeRole + S3 tests)
        → Create Google Drive Source (path, auth type)
```

### 2. Transfer Creation

```
[User] → New Transfer
       → Select Source (Google Drive)
       → Select Customer (S3 destination)
       → Set direction (PUSH/PULL), mode (Copy/Sync)
       → Set destination path (browse S3)
       → Configure performance (concurrency, checkers)
       → Choose launch mode (Start/Queue/Pause)
```

### 3. Execution Phase

```
[System] → BullMQ picks up job
         → STS AssumeRole → temporary credentials
         → Create rclone Google Drive remote
         → Create rclone S3 remote
         → Start rclone async transfer
         → Monitor loop:
              ├── Poll stats every 3s
              ├── Update DB progress
              ├── Broadcast SSE events
              ├── Store snapshots every 30s
              └── Refresh credentials every 50 min
         → Transfer complete
         → Cleanup remotes
         → Trigger next queued transfer
```

### 4. Post-Transfer

```
[User] → View transfer results
       → Run Folder Validation (compare source vs destination)
       → Check validation report (match, differ, missing counts)
       → Optionally re-run with auto-versioned validation name
```

---

## 13. Security Considerations

| Area | Implementation |
|---|---|
| **Authentication** | JWT tokens with 24h expiry, bcrypt password hashing (12 rounds) |
| **Authorization** | Role-based (ADMIN/OPERATOR), JWT guard on all API endpoints |
| **AWS Credentials** | Temporary STS credentials (1h TTL), never stored permanently |
| **Role Chaining** | Extra security layer — base credentials only need operational role permission |
| **Rate Limiting** | ThrottlerModule: 10 req/sec, 100 req/min per client |
| **Input Validation** | NestJS ValidationPipe with whitelist and transform |
| **CORS** | Restricted to configured frontend URL |
| **Google Credentials** | OAuth tokens stored encrypted in database, service account key mounted read-only |
| **rclone Access** | No authentication (internal network only), dynamic remotes cleaned up after each job |
| **Exception Handling** | Global exception filter prevents stack trace leakage |

---

## 14. Deployment Guide

### Local Development

1. **Start infrastructure services:**
   ```bash
   docker-compose up -d
   ```

2. **Backend setup:**
   ```bash
   cd backend
   npm install
   cp .env.example .env     # Configure your .env
   npx prisma migrate dev   # Run database migrations
   npx prisma generate      # Generate Prisma client
   npm run start:dev         # Start in watch mode (port 4000)
   ```

3. **Frontend setup:**
   ```bash
   cd frontend
   npm install
   npm run dev               # Start in dev mode (port 3000)
   ```

4. **Access the dashboard:**
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:4000/api`
   - rclone RC: `http://localhost:5572`

### Production Deployment

1. **Build frontend:**
   ```bash
   cd frontend
   npm run build
   npm start
   ```

2. **Build backend:**
   ```bash
   cd backend
   npm run build
   node dist/main.js
   ```

3. **Nginx** — Use the included `nginx/` configuration as a reverse proxy:
   - Route `/` → Frontend (port 3000)
   - Route `/api` → Backend (port 4000)
   - Handle WebSocket/SSE connections

4. **Environment:**
   - Set `NODE_ENV=production`
   - Use strong `JWT_SECRET`
   - Restrict CORS to production domain
   - Consider AWS EC2 Instance Profile instead of IAM User access keys

---

## Appendix: API Quick Reference

### Authentication
| Method | Endpoint | Auth |
|---|---|---|
| POST | `/api/auth/login` | No |
| POST | `/api/auth/register` | No |
| GET | `/api/auth/profile` | JWT |

### Dashboard
| Method | Endpoint | Auth |
|---|---|---|
| GET | `/api/dashboard/overview` | JWT |
| GET | `/api/dashboard/throughput` | JWT |

### Customers
| Method | Endpoint | Auth |
|---|---|---|
| GET | `/api/customers` | JWT |
| POST | `/api/customers` | JWT |
| GET | `/api/customers/:id` | JWT |
| PUT | `/api/customers/:id` | JWT |
| DELETE | `/api/customers/:id` | JWT |
| POST | `/api/customers/:id/validate` | JWT |
| POST | `/api/customers/browse` | JWT |
| POST | `/api/customers/:id/objects` | JWT |
| POST | `/api/customers/size` | JWT |

### Google Drive
| Method | Endpoint | Auth |
|---|---|---|
| GET | `/api/gdrive/status` | JWT |
| GET | `/api/gdrive/sources` | JWT |
| POST | `/api/gdrive/sources` | JWT |
| GET | `/api/gdrive/sources/:id` | JWT |
| DELETE | `/api/gdrive/sources/:id` | JWT |
| GET | `/api/gdrive/browse` | JWT |
| POST | `/api/gdrive/size` | JWT |
| POST | `/api/gdrive/dedupe` | JWT |

### Transfers
| Method | Endpoint | Auth |
|---|---|---|
| GET | `/api/transfers` | JWT |
| POST | `/api/transfers` | JWT |
| GET | `/api/transfers/:id` | JWT |
| DELETE | `/api/transfers/:id` | JWT |
| POST | `/api/transfers/:id/start` | JWT |
| POST | `/api/transfers/:id/queue` | JWT |
| POST | `/api/transfers/:id/pause` | JWT |
| POST | `/api/transfers/:id/stop` | JWT |
| POST | `/api/transfers/:id/retry` | JWT |
| GET | `/api/transfers/:id/snapshots` | JWT |
| GET | `/api/transfers/:id/events` | SSE |
| GET | `/api/transfers/events/all` | SSE |

### Validations
| Method | Endpoint | Auth |
|---|---|---|
| GET | `/api/validations` | JWT |
| POST | `/api/validations` | JWT |
| GET | `/api/validations/:id` | JWT |
| GET | `/api/validations/:id/report` | JWT |
| DELETE | `/api/validations/:id` | JWT |

### Logs
| Method | Endpoint | Auth |
|---|---|---|
| GET | `/api/logs/transfers/:id` | JWT |

---

*This document is auto-generated from the DataBridge source code. For the latest version, refer to the project repository.*
