/**
 * 认证管理核心模块
 * 支持 Token 加密存储和解密
 */

const fs = require('fs-extra');
const path = require('path');
const { AUTH_CONFIG } = require('./constants');
const { FreelogError } = require('./errors');
const { logger } = require('./logger');
const { encrypt, decrypt } = require('../utils/crypto');

/**
 * 获取认证信息（自动解密Token）
 * @param {boolean} global - 是否获取全局认证
 * @returns {Object|null} 认证信息
 */
function getAuth(global = false) {
  const authPath = global ? AUTH_CONFIG.globalAuthPath : AUTH_CONFIG.workspaceAuthPath;
  
  try {
    if (!fs.existsSync(authPath)) {
      return null;
    }
    
    const authData = fs.readJsonSync(authPath);
    
    // 检查 token 是否过期
    if (isTokenExpired(authData.loginTime, authData.expireDays || AUTH_CONFIG.tokenExpireDays)) {
      return null;
    }
    
    // 解密 Token（如果已加密）
    if (authData.token && authData.encrypted) {
      try {
        authData.token = decrypt(authData.token);
      } catch (err) {
        logger.error('Failed to decrypt token', { error: err.message });
        return null;
      }
    }
    
    // 解密其他加密字段（如果有）
    if (authData.authorization && authData.encrypted) {
      try {
        authData.authorization = decrypt(authData.authorization);
      } catch (err) {
        logger.error('Failed to decrypt authorization', { error: err.message });
      }
    }
    
    return authData;
  } catch (error) {
    logger.error('Failed to read auth data', { error: error.message, authPath });
    return null;
  }
}

/**
 * 保存认证信息（自动加密Token）
 * @param {Object} authData - 认证数据
 * @param {boolean} global - 是否保存为全局认证
 */
function saveAuth(authData, global = false) {
  const authPath = global ? AUTH_CONFIG.globalAuthPath : AUTH_CONFIG.workspaceAuthPath;
  
  try {
    // 确保目录存在
    fs.ensureDirSync(path.dirname(authPath));
    
    // 准备要保存的数据
    const dataToSave = {
      ...authData,
      loginTime: new Date().toISOString(),
      expireDays: AUTH_CONFIG.tokenExpireDays,
      encrypted: true  // 标记数据已加密
    };
    
    // 加密 Token
    if (dataToSave.token) {
      dataToSave.token = encrypt(dataToSave.token);
    }
    
    // 加密 authorization（如果有）
    if (dataToSave.authorization) {
      dataToSave.authorization = encrypt(dataToSave.authorization);
    }
    
    // 保存认证信息
    fs.writeJsonSync(authPath, dataToSave, { spaces: 2 });
    
    logger.info('Auth saved successfully (encrypted)', { global, authPath });
  } catch (error) {
    logger.error('Failed to save auth data', { error: error.message, authPath });
    throw new FreelogError('AUTH_002', '保存认证信息失败');
  }
}

/**
 * 删除认证信息
 * @param {boolean} global - 是否删除全局认证
 */
function removeAuth(global = false) {
  const authPath = global ? AUTH_CONFIG.globalAuthPath : AUTH_CONFIG.workspaceAuthPath;
  
  try {
    if (fs.existsSync(authPath)) {
      fs.removeSync(authPath);
      logger.info('Auth removed successfully', { global, authPath });
    }
  } catch (error) {
    logger.error('Failed to remove auth data', { error: error.message, authPath });
    throw new FreelogError('AUTH_002', '删除认证信息失败');
  }
}

/**
 * 检查是否已登录
 * @param {boolean} global - 是否检查全局登录
 * @returns {boolean} 是否已登录
 */
function isAuthenticated(global = false) {
  const auth = getAuth(global);
  return auth !== null;
}

/**
 * 获取当前有效的认证信息（优先工作空间，其次全局）
 * @returns {Object|null} 认证信息
 */
function getCurrentAuth() {
  // 优先使用工作空间认证
  let auth = getAuth(false);
  if (auth) {
    return { ...auth, scope: 'workspace' };
  }
  
  // 其次使用全局认证
  auth = getAuth(true);
  if (auth) {
    return { ...auth, scope: 'global' };
  }
  
  return null;
}

/**
 * 要求认证（如果未登录则抛出错误）
 * @throws {FreelogError} 未登录错误
 * @returns {Object} 认证信息
 */
function requireAuth() {
  const auth = getCurrentAuth();
  
  if (!auth) {
    throw new FreelogError('AUTH_001');
  }
  
  return auth;
}

/**
 * 检查 token 是否过期
 * @param {string} loginTime - 登录时间
 * @param {number} expireDays - 有效天数
 * @returns {boolean} 是否过期
 */
function isTokenExpired(loginTime, expireDays) {
  if (!loginTime) return true;
  
  const login = new Date(loginTime);
  const now = new Date();
  const diffDays = (now - login) / (1000 * 60 * 60 * 24);
  
  return diffDays > expireDays;
}

/**
 * 获取所有认证状态
 * @returns {Object} 认证状态信息
 */
function getAllAuthStatus() {
  const globalAuth = getAuth(true);
  const workspaceAuth = getAuth(false);
  
  return {
    global: globalAuth ? {
      username: globalAuth.username,
      email: globalAuth.email,
      loginTime: globalAuth.loginTime,
      expireDays: globalAuth.expireDays
    } : null,
    workspace: workspaceAuth ? {
      username: workspaceAuth.username,
      email: workspaceAuth.email,
      loginTime: workspaceAuth.loginTime,
      expireDays: workspaceAuth.expireDays,
      projectPath: process.cwd()
    } : null
  };
}

/**
 * 获取解密后的Token（用于API请求）
 * @param {boolean} global - 是否获取全局认证的Token
 * @returns {string|null} 解密后的Token
 */
function getDecryptedToken(global = false) {
  const auth = getAuth(global);
  return auth ? auth.token : null;
}

/**
 * 获取当前有效的Token（优先工作空间，其次全局）
 * @returns {string|null} 解密后的Token
 */
function getCurrentToken() {
  const auth = getCurrentAuth();
  return auth ? auth.token : null;
}

module.exports = {
  getAuth,
  saveAuth,
  removeAuth,
  isAuthenticated,
  getCurrentAuth,
  requireAuth,
  getAllAuthStatus,
  isTokenExpired,
  getDecryptedToken,
  getCurrentToken
};

