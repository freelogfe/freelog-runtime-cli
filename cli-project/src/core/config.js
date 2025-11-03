/**
 * 配置文件管理核心模块
 */

const fs = require('fs-extra');
const path = require('path');
const { CONFIG_FILE } = require('./constants');
const { FreelogError } = require('./errors');
const { logger } = require('./logger');

/**
 * 获取配置文件路径
 * @param {string} dir - 目录路径，默认当前目录
 * @returns {string} 配置文件路径
 */
function getConfigPath(dir = process.cwd()) {
  return path.join(dir, CONFIG_FILE.name);
}

/**
 * 检查配置文件是否存在
 * @param {string} dir - 目录路径
 * @returns {boolean} 是否存在
 */
function hasConfig(dir = process.cwd()) {
  return fs.existsSync(getConfigPath(dir));
}

/**
 * 读取配置文件
 * @param {string} dir - 目录路径
 * @param {boolean} required - 是否必需（如不存在则抛错）
 * @returns {Object|null} 配置对象
 */
function readConfig(dir = process.cwd(), required = false) {
  const configPath = getConfigPath(dir);
  
  try {
    if (!fs.existsSync(configPath)) {
      if (required) {
        throw new FreelogError('CONFIG_001');
      }
      return null;
    }
    
    const config = fs.readJsonSync(configPath);
    logger.info('Config loaded successfully', { configPath });
    return config;
  } catch (error) {
    if (error instanceof FreelogError) {
      throw error;
    }
    logger.error('Failed to read config', { error: error.message, configPath });
    throw new FreelogError('CONFIG_002', error.message);
  }
}

/**
 * 写入配置文件
 * @param {Object} config - 配置对象
 * @param {string} dir - 目录路径
 */
function writeConfig(config, dir = process.cwd()) {
  const configPath = getConfigPath(dir);
  
  try {
    // 确保目录存在
    fs.ensureDirSync(path.dirname(configPath));
    
    // 写入配置
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    
    logger.info('Config saved successfully', { configPath });
  } catch (error) {
    logger.error('Failed to write config', { error: error.message, configPath });
    throw new FreelogError('CONFIG_002', '保存配置文件失败');
  }
}

/**
 * 更新配置文件（合并）
 * @param {Object} updates - 要更新的配置
 * @param {string} dir - 目录路径
 */
function updateConfig(updates, dir = process.cwd()) {
  const currentConfig = readConfig(dir, true);
  const newConfig = mergeDeep(currentConfig, updates);
  writeConfig(newConfig, dir);
}

/**
 * 创建默认配置文件
 * @param {Object} overrides - 覆盖默认配置的值
 * @param {string} dir - 目录路径
 */
function createDefaultConfig(overrides = {}, dir = process.cwd()) {
  const defaultConfig = JSON.parse(JSON.stringify(CONFIG_FILE.defaultConfig));
  const config = mergeDeep(defaultConfig, overrides);
  writeConfig(config, dir);
  return config;
}

/**
 * 验证配置文件
 * @param {Object} config - 配置对象
 * @returns {Object} 验证结果
 */
function validateConfig(config) {
  const errors = [];
  const warnings = [];
  
  // 必需字段检查
  if (!config.version) {
    errors.push('缺少 version 字段');
  }
  
  if (!config.resource) {
    errors.push('缺少 resource 字段');
  } else {
    if (!config.resource.resourceName) {
      warnings.push('建议设置 resource.resourceName');
    }
    if (!config.resource.resourceType) {
      warnings.push('建议设置 resource.resourceType');
    }
  }
  
  // 版本号格式检查
  if (config.version && !isValidVersion(config.version)) {
    errors.push('version 格式错误，应为语义化版本号（如 1.0.0）');
  }
  
  // 依赖格式检查
  if (config.dependencies) {
    if (!Array.isArray(config.dependencies)) {
      errors.push('dependencies 应为数组');
    } else {
      config.dependencies.forEach((dep, index) => {
        if (!dep.resourceId) {
          errors.push(`dependencies[${index}] 缺少 resourceId`);
        }
        if (!dep.version) {
          errors.push(`dependencies[${index}] 缺少 version`);
        }
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 深度合并对象
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 */
function mergeDeep(target, source) {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = mergeDeep(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  
  return output;
}

/**
 * 检查是否为对象
 * @param {*} item - 要检查的项
 * @returns {boolean} 是否为对象
 */
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * 验证版本号格式
 * @param {string} version - 版本号
 * @returns {boolean} 是否有效
 */
function isValidVersion(version) {
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version);
}

module.exports = {
  getConfigPath,
  hasConfig,
  readConfig,
  writeConfig,
  updateConfig,
  createDefaultConfig,
  validateConfig,
  isValidVersion
};

