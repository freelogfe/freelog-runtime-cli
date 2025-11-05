import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { API_CONFIG, getApiBaseURL } from './constants';
import { getCurrentAuth } from './auth';

const apiClient: AxiosInstance = axios.create({
  timeout: API_CONFIG.timeout,
  headers: API_CONFIG.headers
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.baseURL = getApiBaseURL();
  const auth = getCurrentAuth();
  if (auth?.token) config.headers.Authorization = `Bearer ${auth.token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    const result = response.data;
    if (result.ret !== 0 && result.ret !== undefined) {
      throw new Error(result.msg || 'API请求失败');
    }
    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      const msg = (error.response.data as any)?.msg || (error.response.data as any)?.message || error.message;
      throw new Error(msg);
    }
    throw error;
  }
);

export default apiClient;

