import axios from 'axios';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

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
  browse: (data: { roleArn: string; bucketName: string; region: string; externalId?: string; path?: string }) =>
    apiClient.post('/customers/browse', data),
  size: (data: { roleArn: string; bucketName: string; region: string; externalId?: string; path?: string }) =>
    apiClient.post('/customers/size', data),
  listObjects: (data: { customerId: string; path?: string; page?: number; limit?: number }) =>
    apiClient.post('/customers/list-objects', data),
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

// WAV Duration Streaming Helper
export const streamWavDuration = async (
  type: 'S3' | 'GDrive',
  payload: any,
  onEvent: (event: any) => void
) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ddp_token') : null;
  const endpoint = type === 'S3' ? '/customers/wav-duration' : '/gdrive/wav-duration';
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.body) throw new Error('ReadableStream not supported by browser');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line);
          onEvent(event);
        } catch (e) {
          // ignore parsing error for partial chunks
        }
      }
    }
  }
};

// Validations
export const validationApi = {
  list: () => apiClient.get('/validation'),
  get: (id: string) => apiClient.get(`/validation/${id}`),
  getReport: (id: string) => apiClient.get(`/validation/${id}/report`),
  create: (data: { name: string; sourceId: string; sourcePath?: string; customerId: string; destinationPath?: string; oneWay?: boolean }) =>
    apiClient.post('/validation', data),
  delete: (id: string) => apiClient.delete(`/validation/${id}`),
};
