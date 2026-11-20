import axios from 'axios';

// Resolve API base URL:
// 1. Environment variable if set (trimmed of trailing slashes).
// 2. Production fallback points to the Render backend (never silently to localhost).
// 3. Development fallback points to local server (http://localhost:8000/api).
const rawEnvUrl = import.meta.env.VITE_API_BASE_URL;
const API_BASE_URL = rawEnvUrl
  ? rawEnvUrl.replace(/\/+$/, '')
  : import.meta.env.PROD
  ? 'https://agrishield-api.onrender.com/api'
  : 'http://localhost:8000/api';

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

/**
 * Formats API errors into human-readable messages distinguishing
 * network failures, HTTP 413, HTTP 422 validation, and HTTP 500 server errors.
 */
export const formatApiError = (err, fallback = "An unexpected error occurred") => {
  if (!err) return fallback;

  // 1. Network / CORS / Unreachable backend
  if (!err.response) {
    if (err.code === 'ERR_NETWORK' || err.message?.toLowerCase().includes('network')) {
      return 'Network connection failed. The backend service may be starting up (cold start) or unreachable. Please retry in a few moments.';
    }
    return err.message || 'Unable to connect to the backend service.';
  }

  const status = err.response.status;

  // 2. HTTP 413 Payload Too Large
  if (status === 413) {
    return 'The uploaded image or request payload is too large. Please select a smaller photo or compress it before uploading.';
  }

  // 3. HTTP 422 Unprocessable Entity (FastAPI validation)
  if (status === 422) {
    const detail = err.response.data?.detail;
    if (Array.isArray(detail)) {
      const messages = detail.map((d) => {
        const field = d.loc?.filter((l) => l !== 'body').join('.') || 'Field';
        return `${field}: ${d.msg}`;
      });
      return `Input validation failed: ${messages.join(', ')}`;
    }
    if (typeof detail === 'string') return detail;
    return 'Validation error. Please verify all required inputs.';
  }

  // 4. HTTP 500+ Internal Server Error
  if (status >= 500) {
    const detail = err.response.data?.detail;
    if (typeof detail === 'string' && detail.length < 150) {
      return `Server error (${status}): ${detail}`;
    }
    return 'Internal server error. The server encountered an issue while processing your prediction. Please try again.';
  }

  // Other status codes (400, 403, 404, etc.)
  return err.response.data?.detail || err.message || fallback;
};

export const authAPI = {
  login: (login_id, password) => api.post('/auth/login', { login_id, password }),
  register: (data) => api.post('/auth/register', data),
  getProfile: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/me', data),
  deleteAccount: () => api.delete('/auth/me'),
  requestEmailOTP: (new_email) => api.post('/auth/request-email-otp', { new_email }),
  verifyEmailOTP: (new_email, otp) => api.post('/auth/verify-email-otp', { new_email, otp }),
};

export const adminAPI = {
  listUsers: () => api.get('/admin/users'),
  resetUserPassword: (userId, new_password) =>
    api.post(`/admin/users/${userId}/reset-password`, { new_password }),
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
  parseVoice: (formData) => api.post('/predictions/voice-parse', formData, {
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
