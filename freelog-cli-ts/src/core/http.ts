import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import chalk from 'chalk';
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
        // 根据文档：通过 errCode 来判断错误（errCode !== 0 表示错误）
        // 参考：https://doc.freelog.com/%E9%99%84%E8%A1%A8/%E4%BA%8C%E7%BA%A7%E7%8A%B6%E6%80%81%E7%A0%81.html
        const result = response.data;
        
        // 优先使用 errCode 判断错误，如果没有 errCode 则使用 ret
        const errCode = result.errCode !== undefined ? result.errCode : result.ret;
        if (errCode !== 0 && errCode !== undefined) {
          // 如果是签约接口的错误，打印完整的 request 对象
          const url = response.config?.url || '';
          if (url.includes('/v2/contracts/batchSign') || url.includes('/contracts/batchSign')) {
            console.log(chalk.gray('\n[调试] 签约接口错误 (errCode !== 0) - 完整 Request 对象:'));
            console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
            if (response.config) {
              console.log(chalk.gray(JSON.stringify({
                method: response.config.method,
                url: response.config.url,
                baseURL: response.config.baseURL,
                params: response.config.params,
                headers: response.config.headers,
                data: response.config.data,
                timeout: response.config.timeout,
                timeoutErrorMessage: response.config.timeoutErrorMessage,
                validateStatus: response.config.validateStatus,
                maxContentLength: response.config.maxContentLength,
                maxBodyLength: response.config.maxBodyLength,
              }, null, 2)));
            } else {
              console.log(chalk.gray('response.config 不存在'));
            }
            console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
          }
          
          // 创建一个错误对象，保留完整的响应信息
          const apiError: any = new Error(result.msg || 'API 请求失败');
          apiError.response = response;
          apiError.status = response.status;
          apiError.statusText = response.statusText;
          apiError.data = result;
          apiError.errCode = result.errCode !== undefined ? result.errCode : errCode;
          apiError.ret = result.ret;
          apiError.config = response.config; // 保存完整的请求配置
          throw apiError;
        }
        
        return response;
      },
      (error: AxiosError) => {
        if (error.response) {
          this.lastResponse = error.response;
          const errorData = error.response.data as any;
          const msg = errorData?.msg || errorData?.message || error.message;
          
          // 如果是签约接口的错误，打印完整的 request 对象
          const url = error.config?.url || '';
          if (url.includes('/v2/contracts/batchSign') || url.includes('/contracts/batchSign')) {
            console.log(chalk.gray('\n[调试] 签约接口错误 - 完整 Request 对象:'));
            console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
            if (error.config) {
              console.log(chalk.gray(JSON.stringify({
                method: error.config.method,
                url: error.config.url,
                baseURL: error.config.baseURL,
                params: error.config.params,
                headers: error.config.headers,
                data: error.config.data,
                timeout: error.config.timeout,
                timeoutErrorMessage: error.config.timeoutErrorMessage,
                validateStatus: error.config.validateStatus,
                maxContentLength: error.config.maxContentLength,
                maxBodyLength: error.config.maxBodyLength,
              }, null, 2)));
            } else {
              console.log(chalk.gray('error.config 不存在'));
            }
            console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
          }
          
          // 创建一个新的错误对象，保留原始的 response 信息和完整的错误数据
          const apiError: any = new Error(msg);
          apiError.response = error.response;
          apiError.status = error.response.status;
          apiError.statusText = error.response.statusText;
          apiError.data = errorData; // 保存完整的错误数据
          apiError.originalError = error; // 保存原始错误对象
          apiError.config = error.config; // 保存完整的请求配置
          throw apiError;
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

