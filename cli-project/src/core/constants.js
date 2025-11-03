/**
 * 默认配置常量
 */

const path = require('path');
const os = require('os');

// 环境配置
const ENVIRONMENT = {
  // 测试环境
  development: {
    api: 'http://api.testfreelog.com',
    web: 'https://test.freelog.com'
  },
  
  // 生产环境
  production: {
    api: 'https://api.freelog.com',
    web: 'https://freelog.com'
  }
};

// 获取当前环境
function getCurrentEnv() {
  return process.env.FREELOG_ENV || process.env.NODE_ENV || 'production';
}

// 获取当前环境的 API 地址
function getApiBaseURL() {
  // 优先使用自定义 API URL
  if (process.env.FREELOG_API_URL) {
    return process.env.FREELOG_API_URL;
  }
  
  // 根据环境返回对应的 API
  const env = getCurrentEnv() === 'development' ? 'development' : 'production';
  return ENVIRONMENT[env].api;
}

// API 配置
const API_CONFIG = {
  baseURL: getApiBaseURL(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  },
  
  // API 端点
  endpoints: {
    // 认证
    login: '/v2/passport/login',
    
    // 资源
    resources: '/v2/resources',
    resource: '/v2/resources/{resourceIdOrName}',
    resourceVersions: '/v2/resources/{workId}/versions',
    resourceVersion: '/v2/resources/{resourceId}/versions/{version}',
    resourceDrafts: '/v2/resources/{workId}/versions/drafts',
    
    // 文件上传
    fileUpload: '/v2/storages/files/upload',
    
    // 依赖
    dependencies: '/v2/resources/{resourceId}/versions/{version}/dependencies'
  }
};

// 认证配置
const AUTH_CONFIG = {
  // 全局认证文件路径
  globalAuthPath: path.join(os.homedir(), '.freelog-cli', 'auth.json'),
  // 工作空间认证文件路径
  workspaceAuthPath: path.join(process.cwd(), '.freelog', 'auth.json'),
  // Token 有效期（天）
  tokenExpireDays: 30
};

// 配置文件
const CONFIG_FILE = {
  name: 'freelog.json',
  defaultConfig: {
    version: '1.0.0',
    type: 'object',
    local: {
      buildDir: './dist',
      entryFile: './dist/index.html',
      excludes: ['node_modules', '*.log', '.git']
    },
    resource: {
      resourceId: '',
      resourceName: '',
      resourceType: '',
      coverImages: [],
      description: '',
      tags: []
    },
    properties: [],
    customOptions: [],
    changelog: {},
    dependencies: []
  }
};

// 日志配置
const LOG_CONFIG = {
  // 日志目录
  logDir: path.join(os.homedir(), '.freelog-cli', 'logs'),
  // 日志级别
  level: process.env.LOG_LEVEL || 'info',
  // 最大日志文件大小
  maxSize: '20m',
  // 最大日志文件数量
  maxFiles: '14d'
};

// 文件上传配置
const UPLOAD_CONFIG = {
  // 最大文件大小 (100MB)
  maxSize: 100 * 1024 * 1024,
  // 分片大小 (5MB)
  chunkSize: 5 * 1024 * 1024,
  // 支持的文件类型
  supportedTypes: ['.zip', '.tar.gz', '.tar', '.html', '.js', '.css']
};

// 模板配置
const TEMPLATE_CONFIG = {
  templates: [
    { name: 'package-js', description: '纯 JavaScript 包' },
    { name: 'package-react', description: 'React 组件库' },
    { name: 'package-vue', description: 'Vue 组件库' },
    { name: 'vite-react', description: 'Vite + React' },
    { name: 'vite-react-ts', description: 'Vite + React + TypeScript' },
    { name: 'vite-vue', description: 'Vite + Vue' },
    { name: 'vite-vue-ts', description: 'Vite + Vue + TypeScript' },
    { name: 'webpack-react', description: 'Webpack + React' },
    { name: 'webpack-react-ts', description: 'Webpack + React + TypeScript' },
    { name: 'webpack-vue', description: 'Webpack + Vue' },
    { name: 'webpack-vue-ts', description: 'Webpack + Vue + TypeScript' }
  ]
};

module.exports = {
  ENVIRONMENT,
  API_CONFIG,
  AUTH_CONFIG,
  CONFIG_FILE,
  LOG_CONFIG,
  UPLOAD_CONFIG,
  TEMPLATE_CONFIG,
  getApiBaseURL,
  getCurrentEnv
};

