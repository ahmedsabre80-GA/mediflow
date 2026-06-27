import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:80/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('mediflow-auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const token = parsed?.state?.accessToken;
        if (token) config.headers.Authorization = `Bearer ${token}`;
      } catch { /* ignore */ }
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('mediflow-auth');
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  login: (data: { identifier: string; password: string }) =>
    apiClient.post('/auth/login', data),
  register: (data: Record<string, unknown>) =>
    apiClient.post('/auth/register', data),
  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }),
};

export const pharmaciesApi = {
  getNearby: (params: { lat: number; lng: number; radiusKm?: number; drugId?: string }) =>
    apiClient.get('/gis/pharmacies/nearby', { params }),
  getById: (id: string) =>
    apiClient.get(`/pharmacies/${id}`),
};

export const medicationsApi = {
  search: (params: { q: string; lat?: number; lng?: number }) =>
    apiClient.get('/medications/search', { params }),
};

export const ordersApi = {
  create: (data: Record<string, unknown>) =>
    apiClient.post('/medication-requests', data),
  getOrder: (id: string) =>
    apiClient.get(`/orders/${id}`),
  getOrders: (params?: Record<string, unknown>) =>
    apiClient.get('/orders', { params }),
  cancelOrder: (id: string, reason: string) =>
    apiClient.patch(`/orders/${id}/cancel`, { reason }),
};

export const deliveryApi = {
  trackDelivery: (deliveryId: string) =>
    apiClient.get(`/deliveries/${deliveryId}/track`),
};
