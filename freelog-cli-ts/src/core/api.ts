import axios, { AxiosInstance } from 'axios';
import { API_CONFIG, getApiBaseURL } from './constants';
import { getCurrentAuth } from './auth';

const apiClient: AxiosInstance = axios.create({
  timeout: API_CONFIG.timeout,
  headers: API_CONFIG.headers
});

apiClient.interceptors.request.use(config => {
  config.baseURL = getApiBaseURL();
  const auth = getCurrentAuth();
  if (auth?.token) config.headers.Authorization = `Bearer ${auth.token}`;
  return config;
});

apiClient.interceptors.response.use(
  response => {
    const result = response.data;
    if (result.ret !== 0 && result.ret !== undefined) {
      throw new Error(result.msg || 'API请求失败');
    }
    return response;
  },
  error => {
    if (error.response) {
      const msg = error.response.data?.msg || error.response.data?.message || error.message;
      throw new Error(msg);
    }
    throw error;
  }
);

export default apiClient;

