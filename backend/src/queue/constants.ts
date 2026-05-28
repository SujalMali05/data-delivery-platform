// Queue names
export const TRANSFER_QUEUE = 'transfer-queue';
export const CREDENTIAL_REFRESH_QUEUE = 'credential-refresh-queue';
export const NOTIFICATION_QUEUE = 'notification-queue';
export const SCHEDULED_TRANSFER_QUEUE = 'scheduled-transfer-queue';

// Job names
export const TRANSFER_JOB = 'process-transfer';
export const CREDENTIAL_REFRESH_JOB = 'refresh-credentials';
export const NOTIFICATION_JOB = 'send-notification';
export const SCHEDULED_TRANSFER_JOB = 'scheduled-transfer';

// Timing
export const CREDENTIAL_REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes
export const PROGRESS_POLL_INTERVAL_MS = 3000; // 3 seconds
export const SNAPSHOT_INTERVAL_MS = 30000; // 30 seconds
