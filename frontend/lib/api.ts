import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  timeout: 30000,
});

// ─── Request interceptor: attach access token ────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = Cookies.get('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response interceptor: auto-refresh on 401 ──────────────────────────────
let isRefreshing = false;
let failQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null) => {
  failQueue.forEach(({ resolve, reject }) => (token ? resolve(token) : reject(error)));
  failQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = Cookies.get('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
        const newAccessToken = data.data.accessToken;
        const newRefreshToken = data.data.refreshToken;

        Cookies.set('access_token', newAccessToken, { expires: 1 / 96 });
        Cookies.set('refresh_token', newRefreshToken, { expires: 7 });

        processQueue(null, newAccessToken);
        original.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(original);
      } catch (err) {
        processQueue(err, null);
        Cookies.remove('access_token');
        Cookies.remove('refresh_token');
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login:           (email: string, password: string) => api.post('/auth/login', { email, password }),
  logout:          (refreshToken?: string)            => api.post('/auth/logout', { refreshToken }),
  getMe:           ()                                 => api.get('/auth/me'),
  forgotPassword:  (email: string)                    => api.post('/auth/forgot-password', { email }),
  resetPassword:   (token: string, password: string)  => api.post(`/auth/reset-password/${token}`, { password }),
  updatePassword:  (currentPassword: string, newPassword: string) =>
    api.patch('/auth/update-password', { currentPassword, newPassword }),
};

// ─── Accounts ─────────────────────────────────────────────────────────────────
export const accountsApi = {
  list:     (params?: Record<string, unknown>) => api.get('/accounts', { params }),
  create:   (data: unknown)                    => api.post('/accounts', data),
  get:      (id: string)                       => api.get(`/accounts/${id}`),
  update:   (id: string, data: unknown)        => api.patch(`/accounts/${id}`, data),
  delete:   (id: string)                       => api.delete(`/accounts/${id}`),
  sync:     (id: string)                       => api.post(`/accounts/${id}/sync`),
  syncAll:  ()                                 => api.post('/accounts/sync-all'),
  validate: (id: string)                       => api.post(`/accounts/${id}/validate`),
  toggle:   (id: string)                       => api.patch(`/accounts/${id}/toggle`),
};

// ─── Websites ─────────────────────────────────────────────────────────────────
export const websitesApi = {
  list:        (params?: Record<string, unknown>) => api.get('/websites', { params }),
  create:      (data: unknown)                    => api.post('/websites', data),
  get:         (id: string)                       => api.get(`/websites/${id}`),
  update:      (id: string, data: unknown)        => api.patch(`/websites/${id}`, data),
  delete:      (id: string)                       => api.delete(`/websites/${id}`),
  scan:        (id: string)                       => api.post(`/websites/${id}/scan`),
  getHealth:   (id: string)                       => api.get(`/websites/${id}/health`),
  getThreats:  (id: string)                       => api.get(`/websites/${id}/threats`),
  bulkScan:    (ids: string[])                    => api.post('/websites/bulk-scan', { ids }),
  bulkSSLCheck:(ids: string[])                    => api.post('/websites/bulk-ssl-check', { ids }),
  // Backend route: GET /api/websites/stats  (NOT /stats/summary)
  stats:       ()                                 => api.get('/websites/stats'),
};

// ─── Monitoring ───────────────────────────────────────────────────────────────
export const monitoringApi = {
  // Threats  →  /api/threats
  getThreats:      (params?: Record<string, unknown>) => api.get('/threats', { params }),
  getThreat:       (id: string)                       => api.get(`/threats/${id}`),
  resolveThreat:   (id: string, notes?: string)       => api.patch(`/threats/${id}/resolve`, { notes }),

  // Incidents  →  /api/incidents
  getIncidents:    (params?: Record<string, unknown>) => api.get('/incidents', { params }),
  getIncident:     (id: string)                       => api.get(`/incidents/${id}`),
  resolveIncident: (id: string)                       => api.patch(`/incidents/${id}/resolve`),

  // SSL  →  /api/ssl
  getSSL:          (params?: Record<string, unknown>) => api.get('/ssl', { params }),
  getSSLExpiring:  ()                                 => api.get('/ssl/expiring'),

  // DNS  →  /api/dns
  getDNS:          (params?: Record<string, unknown>) => api.get('/dns', { params }),

  // Screenshots  →  /api/screenshots
  getScreenshots:  (params?: Record<string, unknown>) => api.get('/screenshots', { params }),
};

// ─── Backups ──────────────────────────────────────────────────────────────────
export const backupApi = {
  list:        (params?: Record<string, unknown>) => api.get('/backups', { params }),
  stats:       ()                                 => api.get('/backups/stats'),
  addManual:   (data: unknown)                    => api.post('/backups/manual', data),
  update:      (id: string, data: unknown)        => api.patch(`/backups/${id}`, data),
  delete:      (id: string)                       => api.delete(`/backups/${id}`),
  discover:    (websiteId?: string)               => api.post('/backups/discover', websiteId ? { websiteId } : {}),
  restore:     (data: unknown)                    => api.post('/backups/restore', data),
  history:     (params?: Record<string, unknown>) => api.get('/backups/restore-history', { params }),
  getLog:      (id: string)                       => api.get(`/backups/restore-history/${id}`),
};

// ─── Exports ──────────────────────────────────────────────────────────────────
export const exportApi = {
  websites: (fmt: string, accountId?: string) =>
    api.post('/exports/websites', {}, { params: { format: fmt, accountId }, responseType: 'blob' }),
  threats: (fmt: string, accountId?: string) =>
    api.post('/exports/threats', {}, { params: { format: fmt, accountId }, responseType: 'blob' }),
  ssl: (fmt: string, accountId?: string) =>
    api.post('/exports/ssl', {}, { params: { format: fmt, accountId }, responseType: 'blob' }),
  dns: (fmt: string, accountId?: string) =>
    api.post('/exports/dns', {}, { params: { format: fmt, accountId }, responseType: 'blob' }),
  incidents: (fmt: string, accountId?: string) =>
    api.post('/exports/incidents', {}, { params: { format: fmt, accountId }, responseType: 'blob' }),
  restoreLogs: (fmt: string, accountId?: string) =>
    api.post('/backups/export', {}, { params: { format: fmt, accountId }, responseType: 'blob' }),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsApi = {
  list:           (params?: Record<string, unknown>) => api.get('/reports', { params }),
  get:            (id: string)                       => api.get(`/reports/${id}`),
  generate:       (type: string)                     => api.post('/reports/generate', { type }),
  download:       (id: string, format = 'pdf')       => api.get(`/reports/${id}/download`, { params: { format }, responseType: 'blob' }),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  list:        (params?: Record<string, unknown>) => api.get('/notifications', { params }),
  unreadCount: ()                                  => api.get('/notifications/unread-count'),
  markRead:    (id: string)                        => api.patch(`/notifications/${id}/read`),
  markAllRead: ()                                  => api.patch('/notifications/mark-all-read'),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  list:    (params?: Record<string, unknown>) => api.get('/users', { params }),
  toggle:  (id: string)                       => api.patch(`/users/${id}/toggle`),
  setRole: (id: string, role: string)         => api.patch(`/users/${id}/role`, { role }),
  delete:  (id: string)                       => api.delete(`/users/${id}`),
};

// ─── Helper ───────────────────────────────────────────────────────────────────
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};