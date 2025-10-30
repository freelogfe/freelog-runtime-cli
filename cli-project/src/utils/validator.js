/**
 * 验证器工具
 */

const semver = require('semver');
const { FreelogError } = require('../constants/errors');

/**
 * 验证版本号
 * @param {string} version - 版本号
 * @returns {boolean} 是否有效
 */
function validateVersion(version) {
  if (!semver.valid(version)) {
    throw new FreelogError('VERSION_001', `无效的版本号: ${version}`);
  }
  return true;
}

/**
 * 比较版本号
 * @param {string} v1 - 版本号1
 * @param {string} v2 - 版本号2
 * @returns {number} -1: v1<v2, 0: v1=v2, 1: v1>v2
 */
function compareVersions(v1, v2) {
  return semver.compare(v1, v2);
}

/**
 * 检查版本是否满足范围
 * @param {string} version - 版本号
 * @param {string} range - 版本范围
 * @returns {boolean} 是否满足
 */
function satisfiesVersion(version, range) {
  return semver.satisfies(version, range);
}

/**
 * 递增版本号
 * @param {string} version - 当前版本号
 * @param {string} type - 递增类型 (major|minor|patch)
 * @returns {string} 新版本号
 */
function incrementVersion(version, type = 'patch') {
  validateVersion(version);
  
  const validTypes = ['major', 'minor', 'patch'];
  if (!validTypes.includes(type)) {
    throw new Error(`无效的版本递增类型: ${type}`);
  }
  
  return semver.inc(version, type);
}

/**
 * 验证资源ID格式
 * @param {string} resourceId - 资源ID
 * @returns {boolean} 是否有效
 */
function validateResourceId(resourceId) {
  // 假设资源ID格式为字母数字和下划线
  const pattern = /^[a-zA-Z0-9_-]+$/;
  if (!pattern.test(resourceId)) {
    throw new FreelogError('DEP_001', `无效的资源ID: ${resourceId}`);
  }
  return true;
}

/**
 * 验证邮箱格式
 * @param {string} email - 邮箱
 * @returns {boolean} 是否有效
 */
function validateEmail(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

/**
 * 验证URL格式
 * @param {string} url - URL
 * @returns {boolean} 是否有效
 */
function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 解析资源标识符
 * @param {string} identifier - 资源标识符 (id, name, url)
 * @returns {Object} 解析结果
 */
function parseResourceIdentifier(identifier) {
  // 检查是否为URL
  if (validateUrl(identifier)) {
    return {
      type: 'url',
      value: identifier,
      version: null
    };
  }
  
  // 检查是否包含版本号 (resource@1.0.0)
  const versionMatch = identifier.match(/^(.+)@(.+)$/);
  if (versionMatch) {
    const [, resourcePart, versionPart] = versionMatch;
    return {
      type: validateUrl(resourcePart) ? 'url' : 'identifier',
      value: resourcePart,
      version: versionPart === 'latest' ? 'latest' : versionPart
    };
  }
  
  return {
    type: 'identifier',
    value: identifier,
    version: null
  };
}

/**
 * 验证配置项
 * @param {Object} option - 配置项
 * @returns {boolean} 是否有效
 */
function validateOption(option) {
  const errors = [];
  
  if (!option.key) {
    errors.push('缺少 key 字段');
  }
  
  if (!option.name) {
    errors.push('缺少 name 字段');
  }
  
  if (!option.type) {
    errors.push('缺少 type 字段');
  }
  
  const validTypes = ['input', 'select', 'radio', 'checkbox', 'number', 'textarea'];
  if (option.type && !validTypes.includes(option.type)) {
    errors.push(`无效的类型: ${option.type}`);
  }
  
  if (option.type === 'select' && !option.options) {
    errors.push('select 类型需要 options 字段');
  }
  
  if (errors.length > 0) {
    throw new Error(`配置项验证失败:\n${errors.join('\n')}`);
  }
  
  return true;
}

/**
 * 验证依赖信息
 * @param {Object} dependency - 依赖信息
 * @returns {boolean} 是否有效
 */
function validateDependency(dependency) {
  const errors = [];
  
  if (!dependency.resourceId) {
    errors.push('缺少 resourceId 字段');
  }
  
  if (!dependency.version) {
    errors.push('缺少 version 字段');
  }
  
  if (dependency.version && dependency.version !== 'latest') {
    try {
      validateVersion(dependency.version);
    } catch {
      errors.push(`无效的版本号: ${dependency.version}`);
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`依赖验证失败:\n${errors.join('\n')}`);
  }
  
  return true;
}

module.exports = {
  validateVersion,
  compareVersions,
  satisfiesVersion,
  incrementVersion,
  validateResourceId,
  validateEmail,
  validateUrl,
  parseResourceIdentifier,
  validateOption,
  validateDependency
};

