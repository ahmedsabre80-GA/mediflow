import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth.store';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:80/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT access token to every request
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh token on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) throw new Error('No refresh token');

        const res = await axios.post(`${BASE_URL}/auth/token/refresh`, { refreshToken });
        const { accessToken } = res.data.data;
        useAuthStore.getState().setAccessToken(accessToken);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  },
);

// Typed API methods
export const authApi = {
  login: (data: { identifier: string; password: string }) =>
    apiClient.post('/auth/login', data),
  register: (data: Record<string, unknown>) =>
    apiClient.post('/auth/register', data),
  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }),
};

export const medicationsApi = {
  search: (params: { q: string; lat?: number; lng?: number }) =>
    apiClient.get('/medications/search', { params }),
  getById: (id: string) =>
    apiClient.get(`/medications/${id}`),
};

export const pharmaciesApi = {
  getNearby: (params: { lat: number; lng: number; radiusKm?: number; drugId?: string }) =>
    apiClient.get('/gis/pharmacies/nearby', { params }),
  getById: (id: string) =>
    apiClient.get(`/pharmacies/${id}`),
};

export const ordersApi = {
  create: (data: Record<string, unknown>) =>
    apiClient.post('/medication-requests', data),
  getRequest: (id: string) =>
    apiClient.get(`/medication-requests/${id}`),
  selectOffer: (requestId: string, offerId: string, paymentData: Record<string, unknown>) =>
    apiClient.post(`/medication-requests/${requestId}/select-offer`, { offerId, ...paymentData }),
  getOrders: (params?: Record<string, unknown>) =>
    apiClient.get('/orders', { params }),
  getOrder: (id: string) =>
    apiClient.get(`/orders/${id}`),
  cancelOrder: (id: string, reason: string) =>
    apiClient.patch(`/orders/${id}/cancel`, { reason }),
};

export const prescriptionsApi = {
  upload: (file: File, appointmentId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (appointmentId) formData.append('appointmentId', appointmentId);
    return apiClient.post('/prescriptions/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getAll: () => apiClient.get('/prescriptions'),
  getById: (id: string) => apiClient.get(`/prescriptions/${id}`),
};

export const doctorsApi = {
  search: (params: { specialization?: string; lat?: number; lng?: number }) =>
    apiClient.get('/doctors', { params }),
  getById: (id: string) =>
    apiClient.get(`/doctors/${id}`),
  getAvailability: (id: string, from: string, to: string) =>
    apiClient.get(`/doctors/${id}/availability`, { params: { from, to } }),
  bookAppointment: (data: Record<string, unknown>) =>
    apiClient.post('/appointments', data),
};

export const loyaltyApi = {
  getAccount: () => apiClient.get('/loyalty/me'),
  redeem: (points: number, orderId: string) =>
    apiClient.post('/loyalty/redeem', { points, orderId }),
};

export const deliveryApi = {
  trackDelivery: (deliveryId: string) =>
    apiClient.get(`/deliveries/${deliveryId}/track`),
};
