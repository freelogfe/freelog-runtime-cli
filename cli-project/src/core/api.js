/**
 * API 请求核心模块
 */

const axios = require('axios');
const { API_CONFIG } = require('../constants/config');
const { FreelogError } = require('../constants/errors');
const { logger } = require('./logger');
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
 * 请求拦截器
 */
apiClient.interceptors.request.use(
  config => {
    // 添加认证 token
    const auth = getCurrentAuth();
    if (auth && auth.token) {
      config.headers.Authorization = `Bearer ${auth.token}`;
    }
    
    logger.info('API Request', {
      method: config.method,
      url: config.url,
      params: config.params
    });
    
    return config;
  },
  error => {
    logger.error('Request Error', { error: error.message });
    return Promise.reject(error);
  }
);

/**
 * 响应拦截器
 */
apiClient.interceptors.response.use(
  response => {
    logger.info('API Response', {
      status: response.status,
      url: response.config.url
    });
    return response.data;
  },
  error => {
    // 处理错误响应
    if (error.response) {
      const { status, data } = error.response;
      
      logger.error('API Error', {
        status,
        url: error.config.url,
        data
      });
      
      // 根据状态码抛出相应错误
      switch (status) {
      case 401:
        throw new FreelogError('AUTH_001');
      case 403:
        throw new FreelogError('AUTH_003');
      case 404:
        throw new FreelogError('DEP_001', data.message);
      case 500:
        throw new FreelogError('SERVER_001', data.message);
      default:
        throw new FreelogError('NETWORK_001', data.message || error.message);
      }
    } else if (error.request) {
      // 请求已发出但没有收到响应
      logger.error('Network Error', { error: error.message });
      throw new FreelogError('NETWORK_002');
    } else {
      // 其他错误
      logger.error('Unknown Error', { error: error.message });
      throw new FreelogError('NETWORK_001', error.message);
    }
  }
);

/**
 * 用户登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<Object>} 用户信息和 token
 */
async function login(username, password) {
  try {
    const response = await apiClient.post('/auth/login', {
      username,
      password
    });
    return response;
  } catch (error) {
    if (error instanceof FreelogError) {
      throw error;
    }
    throw new FreelogError('AUTH_002', '登录失败');
  }
}

/**
 * 发布作品
 * @param {Object} data - 发布数据
 * @returns {Promise<Object>} 发布结果
 */
async function publishResource(data) {
  return await apiClient.post('/resources/publish', data);
}

/**
 * 发布草稿
 * @param {Object} data - 发布数据
 * @returns {Promise<Object>} 发布结果
 */
async function publishDraft(data) {
  return await apiClient.post('/resources/draft', data);
}

/**
 * 获取资源信息
 * @param {string} resourceIdOrName - 资源ID或名称
 * @returns {Promise<Object>} 资源信息
 */
async function getResource(resourceIdOrName) {
  return await apiClient.get(`/v2/resources/${resourceIdOrName}`);
}

/**
 * 获取资源版本信息
 * @param {string} resourceId - 资源ID
 * @param {string} version - 版本号 (可以是 'latest' 获取最新版本)
 * @returns {Promise<Object>} 版本信息
 */
async function getResourceVersion(resourceId, version = 'latest') {
  // 如果是 latest，需要先获取资源信息来找到最新版本
  if (version === 'latest') {
    const resource = await apiClient.get(`/v2/resources/${resourceId}`);
    version = resource.latestVersion || resource.version;
  }
  return await apiClient.get(`/v2/resources/${resourceId}/versions/${version}`);
}

/**
 * 获取依赖列表
 * @param {string} resourceId - 资源ID
 * @param {string} version - 版本号
 * @returns {Promise<Array>} 依赖列表
 */
async function getDependencies(resourceId, version) {
  return await apiClient.get(`/resources/${resourceId}/versions/${version}/dependencies`);
}

/**
 * 添加依赖
 * @param {string} resourceId - 资源ID
 * @param {Object} dependency - 依赖信息
 * @returns {Promise<Object>} 添加结果
 */
async function addDependency(resourceId, dependency) {
  return await apiClient.post(`/resources/${resourceId}/dependencies`, dependency);
}

/**
 * 删除依赖
 * @param {string} resourceId - 资源ID
 * @param {string} dependencyId - 依赖ID
 * @returns {Promise<Object>} 删除结果
 */
async function removeDependency(resourceId, dependencyId) {
  return await apiClient.delete(`/resources/${resourceId}/dependencies/${dependencyId}`);
}

/**
 * 更新依赖
 * @param {string} resourceId - 资源ID
 * @param {string} dependencyId - 依赖ID
 * @param {Object} updates - 更新信息
 * @returns {Promise<Object>} 更新结果
 */
async function updateDependency(resourceId, dependencyId, updates) {
  return await apiClient.put(`/resources/${resourceId}/dependencies/${dependencyId}`, updates);
}

/**
 * 获取策略列表
 * @param {string} resourceId - 资源ID
 * @returns {Promise<Array>} 策略列表
 */
async function getPolicies(resourceId) {
  return await apiClient.get(`/resources/${resourceId}/policies`);
}

/**
 * 签约策略
 * @param {string} policyId - 策略ID
 * @param {Object} data - 签约数据
 * @returns {Promise<Object>} 签约结果
 */
async function signContract(policyId, data) {
  return await apiClient.post(`/policies/${policyId}/sign`, data);
}

/**
 * 上传文件
 * @param {string} filePath - 文件路径
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<Object>} 上传结果
 */
async function uploadFile(filePath, onProgress) {
  const FormData = require('form-data');
  const fs = require('fs');
  
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  
  return await apiClient.post('/files/upload', form, {
    headers: form.getHeaders(),
    onUploadProgress: progressEvent => {
      if (onProgress) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    }
  });
}

/**
 * 搜索资源
 * @param {string} keyword - 搜索关键词
 * @param {Object} options - 搜索选项
 * @returns {Promise<Array>} 搜索结果
 */
async function searchResources(keyword, options = {}) {
  return await apiClient.get('/resources/search', {
    params: {
      keyword,
      ...options
    }
  });
}

module.exports = {
  apiClient,
  login,
  publishResource,
  publishDraft,
  getResource,
  getResourceVersion,
  getDependencies,
  addDependency,
  removeDependency,
  updateDependency,
  getPolicies,
  signContract,
  uploadFile,
  searchResources
};

