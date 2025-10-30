/**
 * 错误代码常量
 */

const ERROR_CODES = {
  // 认证相关错误
  AUTH_001: {
    code: 'AUTH_001',
    message: '未登录或登录已过期',
    solution: '请执行 freelog-cli login 重新登录'
  },
  AUTH_002: {
    code: 'AUTH_002',
    message: '登录凭证无效',
    solution: '请检查用户名和密码'
  },
  AUTH_003: {
    code: 'AUTH_003',
    message: '权限不足',
    solution: '请联系管理员授权'
  },

  // 文件相关错误
  FILE_001: {
    code: 'FILE_001',
    message: '文件不存在',
    solution: '请检查文件路径'
  },
  FILE_002: {
    code: 'FILE_002',
    message: '文件格式不支持',
    solution: '请使用支持的文件格式'
  },
  FILE_003: {
    code: 'FILE_003',
    message: '文件大小超限',
    solution: '请减小文件大小'
  },

  // 版本相关错误
  VERSION_001: {
    code: 'VERSION_001',
    message: '版本号格式错误',
    solution: '请使用语义化版本号（如 1.0.0）'
  },
  VERSION_002: {
    code: 'VERSION_002',
    message: '版本号已存在',
    solution: '请使用新的版本号'
  },
  VERSION_003: {
    code: 'VERSION_003',
    message: '版本号不能降级',
    solution: '版本号必须大于当前版本'
  },

  // 依赖相关错误
  DEP_001: {
    code: 'DEP_001',
    message: '依赖不存在',
    solution: '请检查依赖ID或名称'
  },
  DEP_002: {
    code: 'DEP_002',
    message: '依赖版本不存在',
    solution: '请检查版本号'
  },
  DEP_003: {
    code: 'DEP_003',
    message: '依赖未授权',
    solution: '请完成依赖授权流程'
  },
  DEP_004: {
    code: 'DEP_004',
    message: '依赖版本冲突',
    solution: '请更新依赖版本'
  },

  // 配置相关错误
  CONFIG_001: {
    code: 'CONFIG_001',
    message: '配置文件不存在',
    solution: '请执行 freelog-cli sync 初始化配置'
  },
  CONFIG_002: {
    code: 'CONFIG_002',
    message: '配置文件格式错误',
    solution: '请检查 JSON 格式'
  },

  // 网络相关错误
  NETWORK_001: {
    code: 'NETWORK_001',
    message: '网络连接失败',
    solution: '请检查网络连接'
  },
  NETWORK_002: {
    code: 'NETWORK_002',
    message: '服务器响应超时',
    solution: '请稍后重试'
  },

  // 服务器相关错误
  SERVER_001: {
    code: 'SERVER_001',
    message: '服务器内部错误',
    solution: '请联系技术支持'
  }
};

/**
 * 自定义错误类
 */
class FreelogError extends Error {
  constructor(errorCode, details = '') {
    const error = ERROR_CODES[errorCode];
    const message = details ? `${error.message}: ${details}` : error.message;
    super(message);
    
    this.name = 'FreelogError';
    this.code = error.code;
    this.solution = error.solution;
  }

  toString() {
    return `Error [${this.code}]: ${this.message}\n\n解决方案:\n  ${this.solution}`;
  }
}

module.exports = {
  ERROR_CODES,
  FreelogError
};

