import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { API_CONFIG, getApiBaseURL } from './constants';
import { getCurrentAuth } from './auth';

/**
 * Freelog 请求客户端类
 * 提供统一的 HTTP 请求接口，支持：
 * 1. 自动注入 baseURL 和 Authorization
 * 2. 统一错误处理
 * 3. 获取完整响应（包括 headers）
 */
class FreelogRequestClient {
  private instance: AxiosInstance;
  private lastResponse?: AxiosResponse;

  constructor() {
    this.instance = axios.create({
      timeout: API_CONFIG.timeout,
      headers: API_CONFIG.headers
    });

    this.setupInterceptors();
  }

  /**
   * 配置拦截器
   */
  private setupInterceptors(): void {
    // 请求拦截器：注入 baseURL 和 Authorization
    this.instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        config.baseURL = getApiBaseURL();
        const auth = getCurrentAuth();
        
        if (auth?.token) {
          // 优先使用 authorization 字段（登录接口返回的完整 token）
          // 否则使用 Bearer + token 格式
          config.headers.Authorization = auth.authorization || `Bearer ${auth.token}`;
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器：统一处理响应和错误
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        // 保存最后的响应（用于获取响应头等信息）
        this.lastResponse = response;
        
        // 检查 Freelog API 标准响应格式
        const result = response.data;
        if (result.ret !== 0 && result.ret !== undefined) {
          throw new Error(result.msg || 'API 请求失败');
        }
        
        return response;
      },
      (error: AxiosError) => {
        if (error.response) {
          this.lastResponse = error.response;
          const errorData = error.response.data as any;
          const msg = errorData?.msg || errorData?.message || error.message;
          throw new Error(msg);
        }
        throw error;
      }
    );
  }

  /**
   * GET 请求
   * @returns 返回 response.data.data（Freelog API 标准数据字段）
   */
  async get<T = any>(url: string, config?: any): Promise<T> {
    const response = await this.instance.get(url, config);
    return response.data.data;
  }

  /**
   * POST 请求
   * @returns 返回 response.data.data（Freelog API 标准数据字段）
   */
  async post<T = any>(url: string, data?: any, config?: any): Promise<T> {
    const response = await this.instance.post(url, data, config);
    return response.data.data;
  }

  /**
   * PUT 请求
   * @returns 返回 response.data.data（Freelog API 标准数据字段）
   */
  async put<T = any>(url: string, data?: any, config?: any): Promise<T> {
    const response = await this.instance.put(url, data, config);
    return response.data.data;
  }

  /**
   * DELETE 请求
   * @returns 返回 response.data.data（Freelog API 标准数据字段）
   */
  async delete<T = any>(url: string, config?: any): Promise<T> {
    const response = await this.instance.delete(url, config);
    return response.data.data;
  }

  /**
   * 获取最后一次请求的完整响应
   * 用于需要访问响应头（如 Authorization）等场景
   */
  getLastResponse(): AxiosResponse | undefined {
    return this.lastResponse;
  }
}

// 导出单例实例
export const freelogRequest = new FreelogRequestClient();

// 向后兼容：导出默认 axios 实例（已废弃，建议使用 freelogRequest）
export default freelogRequest;

