import axios from 'axios';

export const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || `http://${window.location.hostname}:4000/api`)
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api');

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to requests
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('ddp_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('ddp_token');
      localStorage.removeItem('ddp_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default apiClient;

// ── API Functions ─────────────────────────────

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),
  me: () => apiClient.get('/auth/me'),
};

// Dashboard
export const dashboardApi = {
  overview: () => apiClient.get('/dashboard/overview'),
  throughput: () => apiClient.get('/dashboard/throughput'),
};

// Customers
export const customersApi = {
  list: () => apiClient.get('/customers'),
  get: (id: string) => apiClient.get(`/customers/${id}`),
  create: (data: any) => apiClient.post('/customers', data),
  update: (id: string, data: any) => apiClient.put(`/customers/${id}`, data),
  delete: (id: string) => apiClient.delete(`/customers/${id}`),
  validate: (id: string) => apiClient.post(`/customers/${id}/validate`),
  browse: (data: { roleArn: string; bucketName: string; region: string; externalId?: string; path?: string; showFiles?: boolean }) =>
    apiClient.post('/customers/browse', data),
  size: (data: { roleArn: string; bucketName: string; region: string; externalId?: string; path?: string }) =>
    apiClient.post('/customers/size', data),
  listObjects: (data: { customerId: string; path?: string; page?: number; limit?: number; sortDir?: 'asc' | 'desc'; startDate?: string; endDate?: string; sortBy?: 'name' | 'date' }) =>
    apiClient.post('/customers/list-objects', data),
  downloadObject: (customerId: string, path: string) =>
    apiClient.post('/customers/download-object', { customerId, path }, { responseType: 'blob' }),
};

// Google Drive
export const gdriveApi = {
  status: () => apiClient.get('/gdrive/status'),
  sources: () => apiClient.get('/gdrive/sources'),
  createSource: (data: any) => apiClient.post('/gdrive/sources', data),
  deleteSource: (id: string) => apiClient.delete(`/gdrive/sources/${id}`),
  browse: (data: {
    path?: string;
    sharedDriveId?: string;
    authType?: string;
    showFiles?: boolean;
  }) => apiClient.post('/gdrive/browse', data),
  size: (data: {
    path?: string;
    sharedDriveId?: string;
    authType?: string;
  }) => apiClient.post('/gdrive/size', data),
  dedupe: (data: {
    sourceId: string;
    path?: string;
    mode?: 'newest' | 'oldest' | 'rename' | 'skip';
    sharedDriveId?: string;
    authType?: string;
  }) => apiClient.post('/gdrive/dedupe', data),
};

// Transfers
export const transfersApi = {
  list: (params?: { status?: string; page?: number; limit?: number }) =>
    apiClient.get('/transfers', { params }),
  get: (id: string) => apiClient.get(`/transfers/${id}`),
  create: (data: any) => apiClient.post('/transfers', data),
  dryRun: (data: any) => apiClient.post('/transfers/dry-run', data, { timeout: 600000 }),
  start: (id: string) => apiClient.post(`/transfers/${id}/start`),
  queue: (id: string) => apiClient.post(`/transfers/${id}/queue`),
  pause: (id: string) => apiClient.post(`/transfers/${id}/pause`),
  stop: (id: string) => apiClient.post(`/transfers/${id}/stop`),
  retry: (id: string) => apiClient.post(`/transfers/${id}/retry`),
  snapshots: (id: string) => apiClient.get(`/transfers/${id}/snapshots`),
  delete: (id: string) => apiClient.delete(`/transfers/${id}`),
};

// Logs
export const logsApi = {
  list: (params?: { transferId?: string; level?: string; search?: string; page?: number }) =>
    apiClient.get('/logs', { params }),
  byTransfer: (transferId: string) => apiClient.get(`/logs/transfer/${transferId}`),
};

// Validations
export const validationApi = {
  list: () => apiClient.get('/validation'),
  get: (id: string) => apiClient.get(`/validation/${id}`),
  getReport: (id: string) => apiClient.get(`/validation/${id}/report`),
  create: (data: {
    name: string;
    sourceType: string;
    sourceId: string;
    sourcePath?: string;
    destType: string;
    destId: string;
    destinationPath?: string;
    oneWay?: boolean;
    ignoreExtension?: boolean;
  }) =>
    apiClient.post('/validation', data),
  delete: (id: string) => apiClient.delete(`/validation/${id}`),
};

// Batch Operations
export const batchOperationsApi = {
  runDelete: (data: {
    storageType: 'GDrive' | 'S3';
    storageId: string;
    path?: string;
    csvContent?: string;
    paths?: string[];
  }) => apiClient.post('/batch-operations/delete', data),
  analyzeDelete: (data: {
    storageType: 'GDrive' | 'S3';
    storageId: string;
    path?: string;
    csvContent: string;
    ignoreExtension?: boolean;
  }) => apiClient.post('/batch-operations/delete/analyze', data),
  runCopy: (data: {
    sourceType: 'GDrive' | 'S3';
    sourceId: string;
    sourcePath?: string;
    destType: 'GDrive' | 'S3';
    destId: string;
    destinationPath?: string;
    csvContent?: string;
    paths?: string[];
  }) => apiClient.post('/batch-operations/copy', data),
  analyzeCopy: (data: {
    sourceType: 'GDrive' | 'S3';
    sourceId: string;
    sourcePath?: string;
    csvContent: string;
    ignoreExtension?: boolean;
  }) => apiClient.post('/batch-operations/copy/analyze', data),
  analyzeCopyAllObjects: (data: {
    sourceType: 'GDrive' | 'S3';
    sourceId: string;
    sourcePath?: string;
  }) => apiClient.post('/batch-operations/copy/analyze-all', data),
  analyzeCopySync: (data: {
    sourceType: 'GDrive' | 'S3';
    sourceId: string;
    sourcePath?: string;
    destType: 'GDrive' | 'S3';
    destId: string;
    destinationPath?: string;
    ignoreExtension?: boolean;
  }) => apiClient.post('/batch-operations/copy/analyze-sync', data),
  runCopySync: (data: {
    sourceType: 'GDrive' | 'S3';
    sourceId: string;
    sourcePath?: string;
    destType: 'GDrive' | 'S3';
    destId: string;
    destinationPath?: string;
    toCopy: string[];
    toDelete: string[];
  }) => apiClient.post('/batch-operations/copy/sync', data),
};

// WAV Calculations History
export const wavCalculationsApi = {
  list: () => apiClient.get('/wav-calculations'),
  get: (id: string) => apiClient.get(`/wav-calculations/${id}`),
  create: (data: {
    name: string;
    storageType: string;
    targetPath: string;
    sourceName: string;
    parameters?: Record<string, any>;
  }) => apiClient.post('/wav-calculations', data),
  delete: (id: string) => apiClient.delete(`/wav-calculations/${id}`),
};
