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

/**
 * Freelog 请求客户端类
 * 提供统一的请求接口，支持获取响应头
 */
class FreelogRequestClient {
  private instance: AxiosInstance;
  public lastResponse?: AxiosResponse;

  constructor() {
    this.instance = axios.create({
      timeout: API_CONFIG.timeout,
      headers: API_CONFIG.headers
    });

    // 请求拦截器
    this.instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      config.baseURL = getApiBaseURL();
      const auth = getCurrentAuth();
      if (auth?.token) {
        config.headers.Authorization = auth.authorization || `Bearer ${auth.token}`;
      }
      return config;
    });

    // 响应拦截器
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        // 保存最后的响应（包含 headers）
        this.lastResponse = response;
        
        const result = response.data;
        if (result.ret !== 0 && result.ret !== undefined) {
          throw new Error(result.msg || 'API请求失败');
        }
        return response;
      },
      (error: AxiosError) => {
        if (error.response) {
          this.lastResponse = error.response;
          const msg = (error.response.data as any)?.msg || (error.response.data as any)?.message || error.message;
          throw new Error(msg);
        }
        throw error;
      }
    );
  }

  /**
   * GET 请求
   */
  async get<T = any>(url: string, config?: any): Promise<T> {
    const response = await this.instance.get(url, config);
    return response.data.data;
  }

  /**
   * POST 请求
   */
  async post<T = any>(url: string, data?: any, config?: any): Promise<T> {
    const response = await this.instance.post(url, data, config);
    return response.data.data;
  }

  /**
   * PUT 请求
   */
  async put<T = any>(url: string, data?: any, config?: any): Promise<T> {
    const response = await this.instance.put(url, data, config);
    return response.data.data;
  }

  /**
   * DELETE 请求
   */
  async delete<T = any>(url: string, config?: any): Promise<T> {
    const response = await this.instance.delete(url, config);
    return response.data.data;
  }

  /**
   * 获取最后一次响应
   */
  getLastResponse(): AxiosResponse | undefined {
    return this.lastResponse;
  }
}

// 导出单例
export const freelogRequest = new FreelogRequestClient();

