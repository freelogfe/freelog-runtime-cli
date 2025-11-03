/**
 * API 请求核心模块
 * 仅配置 axios 实例，不封装具体 API
 */

const axios = require('axios');
const { API_CONFIG } = require('./constants');
const { getCurrentAuth } = require('./auth');

/**
 * 创建 axios 实例
 */
const apiClient = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: API_CONFIG.headers
});

/**
 * 请求拦截器 - 自动注入 Token
 */
apiClient.interceptors.request.use(
  config => {
    const auth = getCurrentAuth();
    if (auth && auth.token) {
      config.headers.Authorization = `Bearer ${auth.token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

/**
 * 响应拦截器 - 统一处理 Freelog API 响应格式
 */
apiClient.interceptors.response.use(
  response => {
    // Freelog API 格式：{ ret: 0, msg: "success", data: {...} }
    const result = response.data;
    
    // 检查返回码
    if (result.ret !== 0 && result.ret !== undefined) {
      throw new Error(result.msg || 'API请求失败');
    }
    
    return result;
  },
  error => {
    // 直接抛出错误，让调用方处理
    if (error.response) {
      const msg = error.response.data?.msg || error.response.data?.message || error.message;
      throw new Error(msg);
    }
    throw error;
  }
);

module.exports = apiClient;
