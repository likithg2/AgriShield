import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (login_id, password) => api.post('/auth/login', { login_id, password }),
  register: (data) => api.post('/auth/register', data),
  sendRegisterOTP: (email) => api.post('/auth/register-otp', { email }),
  getProfile: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/me', data),
  deleteAccount: () => api.delete('/auth/me'),
  sendOTP: (login_id) => api.post('/auth/send-otp', { login_id }),
  verifyOTPLogin: (login_id, otp) => api.post('/auth/verify-otp-login', { login_id, otp }),
  forgotPassword: (login_id) => api.post('/auth/forgot-password', { login_id }),
  resetPassword: (login_id, otp, new_password) => api.post('/auth/reset-password', { login_id, otp, new_password }),
  requestEmailOTP: (new_email) => api.post('/auth/request-email-otp', { new_email }),
  verifyEmailOTP: (new_email, otp) => api.post('/auth/verify-email-otp', { new_email, otp }),
};

export const predictionsAPI = {
  create: (data) => api.post('/predictions/', data),
  list: (params) => api.get('/predictions/', { params }),
  getAnalytics: (params) => api.get('/predictions/analytics', { params }),
  getAdvisoryAudio: (data) => api.post('/predictions/advisory-audio', data, { responseType: 'blob' }),
  getWeather: (district) => api.get('/predictions/weather', { params: { district } }),
  analyzeImage: (formData) => api.post('/predictions/analyze-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

export const shipmentsAPI = {
  create: (data) => api.post('/shipments/', data),
  list: (params) => api.get('/shipments/', { params }),
  listActive: (params) => api.get('/shipments/active', { params }),
  update: (id, data) => api.put(`/shipments/${id}`, data),
};

export const farmersAPI = {
  getDashboard: () => api.get('/farmers/dashboard'),
};

export const warehousesAPI = {
  list: () => api.get('/warehouses/'),
  update: (id, data) => api.put(`/warehouses/${id}`, data),
  simulateFault: (id, simulate) => api.post(`/warehouses/${id}/simulate-fault`, { simulate }),
  inspectShipment: (id, data) => api.post(`/warehouses/${id}/inspect`, data),
  dispatchShipment: (id, shipmentId, action) => api.post(`/warehouses/${id}/dispatch`, null, { params: { shipment_id: shipmentId, action } }),
};

export const notificationsAPI = {
  list: () => api.get('/notifications/'),
  unreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
};

export default api;

export const aiAPI = {
  getSuggestions: (district, language) => api.get('/ai/suggestions', { params: { district, language } }),
  chat: (messages, language, session_id) => api.post('/ai/chat', { messages, language, session_id }),
  getSessions: () => api.get('/ai/sessions'),
  getSessionMessages: (sessionId) => api.get(`/ai/sessions/${sessionId}`)
};
