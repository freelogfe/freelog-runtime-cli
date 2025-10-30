/**
 * 登录命令
 * 支持全局登录（-g）和工作空间登录
 * Token 自动加密存储
 */

const inquirer = require('inquirer');
const axios = require('axios');
const { saveAuth } = require('../../core/auth');
const { logOperation, logError } = require('../../core/logger');
const { startSpinner, succeedSpinner, failSpinner } = require('../../utils/spinner');
const { success, error, info } = require('../../utils/output');
const { FreelogError } = require('../../constants/errors');

/**
 * 调用 Freelog 登录 API
 * @param {string} loginName - 用户名或邮箱
 * @param {string} password - 密码
 * @returns {Promise<Object>} 登录结果
 */
async function callLoginApi(loginName, password) {
  try {
    const response = await axios({
      url: 'http://api.testfreelog.com/v2/passport/login',
      method: 'POST',
      data: {
        loginName,
        password,
        jwtType: 'header'
      }
    });

    const { data, headers } = response;

    // 检查 API 返回的错误
    if (data.errCode) {
      throw new FreelogError('AUTH_001', data.msg || '登录失败');
    }

    // 返回登录信息
    return {
      userInfo: data.data,
      token: headers.authorization || headers.Authorization,
      headers
    };
  } catch (err) {
    if (err instanceof FreelogError) {
      throw err;
    }
    if (err.response) {
      const msg = err.response.data?.msg || err.response.statusText || '登录请求失败';
      throw new FreelogError('AUTH_001', msg);
    }
    throw new FreelogError('AUTH_001', `网络错误: ${err.message}`);
  }
}

/**
 * 执行登录命令
 * @param {Object} options - 命令选项
 * @param {boolean} options.global - 是否全局登录
 * @param {string} options.username - 用户名（可选）
 * @param {string} options.password - 密码（可选）
 */
async function executeLogin(options) {
  try {
    const isGlobal = options.global || false;
    
    logOperation('login', { global: isGlobal });
    
    // 提示登录范围
    if (isGlobal) {
      info('正在执行全局登录...');
    } else {
      info(`正在执行工作空间登录... (${process.cwd()})`);
    }
    
    // 获取用户名和密码
    let username = options.username;
    let password = options.password;
    
    // 如果没有提供用户名或密码，则交互式询问
    if (!username || !password) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'username',
          message: '请输入用户名或邮箱:',
          when: !username,
          validate: input => {
            if (!input.trim()) {
              return '用户名不能为空';
            }
            return true;
          }
        },
        {
          type: 'password',
          name: 'password',
          message: '请输入密码:',
          when: !password,
          mask: '*',
          validate: input => {
            if (!input) {
              return '密码不能为空';
            }
            return true;
          }
        }
      ]);
      
      username = username || answers.username;
      password = password || answers.password;
    }
    
    // 开始登录
    let spinner = startSpinner('正在登录...');
    
    try {
      // 调用登录 API
      const result = await callLoginApi(username, password);
      
      // 准备认证数据
      const authData = {
        username: result.userInfo.username,
        email: result.userInfo.email,
        userId: result.userInfo.userId,
        token: result.token,
        authorization: result.token,  // 同时保存 authorization
        userInfo: result.userInfo
      };
      
      // 保存认证信息（自动加密）
      saveAuth(authData, isGlobal);
      
      succeedSpinner(
        isGlobal 
          ? '全局登录成功!' 
          : '工作空间登录成功!'
      );
      spinner = null;
      
      // 显示成功信息
      success(`欢迎, ${authData.username || authData.email}!`);
      
      if (isGlobal) {
        info('Token 已加密保存到全局配置');
      } else {
        info('Token 已加密保存到当前工作空间');
      }
      
      logOperation('login_success', { 
        username, 
        global: isGlobal,
        userId: authData.userId 
      });
      
    } catch (err) {
      if (spinner) {
        failSpinner('登录失败');
        spinner = null;
      }
      
      if (err instanceof FreelogError) {
        error(err.toString());
      } else {
        error(`登录失败: ${err.message}`);
      }
      
      logError(err, { username, global: isGlobal });
      process.exit(1);
    }
    
  } catch (err) {
    error(`执行登录命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

module.exports = executeLogin;

