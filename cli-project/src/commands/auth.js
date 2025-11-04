/**
 * 认证命令集合（login / logout / status）
 */

const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const apiClient = require('../core/api');
const { saveAuth, removeAuth, isAuthenticated, getAllAuthStatus } = require('../core/auth');
const { logOperation, logError } = require('../core/logger');
const { printAuthStatus } = require('../utils/output');
const { FreelogError } = require('../core/errors');

// ==================== LOGIN ====================

/**
 * 调用 Freelog 登录 API
 */
async function callLoginApi(loginName, password) {
  try {
    const response = await apiClient.post('/v2/passport/login', {
      loginName,
      password,
      jwtType: 'header'
    });

    const { data, headers } = response;
    if (data.errCode) {
      throw new FreelogError('AUTH_001', data.msg || '登录失败');
    }

    return {
      userInfo: data.data,
      token: headers.authorization || headers.Authorization || headers.get('authorization'),
      headers
    };
  } catch (err) {
    if (err instanceof FreelogError) throw err;
    if (err.response) {
      const msg = err.response.data?.msg || err.response.statusText || '登录请求失败';
      throw new FreelogError('AUTH_001', msg);
    }
    throw new FreelogError('AUTH_001', `网络错误: ${err.message}`);
  }
}

/**
 * 执行登录命令
 */
async function executeLogin(options) {
  try {
    const isGlobal = options.global || false;
    logOperation('login', { global: isGlobal });
    
    console.log(chalk.blue('ℹ ') + (isGlobal ? '正在执行全局登录...' : `正在执行工作空间登录... (${process.cwd()})`));
    
    let username = options.username;
    let password = options.password;
    
    if (!username || !password) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'username',
          message: '请输入用户名或邮箱:',
          when: !username,
          validate: input => input.trim() ? true : '用户名不能为空'
        },
        {
          type: 'password',
          name: 'password',
          message: '请输入密码:',
          when: !password,
          mask: '*',
          validate: input => input ? true : '密码不能为空'
        }
      ]);
      
      username = username || answers.username;
      password = password || answers.password;
    }
    
    const spinner = ora('正在登录...').start();
    
    try {
      const result = await callLoginApi(username, password);
      
      const authData = {
        username: result.userInfo.username,
        email: result.userInfo.email,
        userId: result.userInfo.userId,
        token: result.token,
        authorization: result.token,
        userInfo: result.userInfo
      };
      
      saveAuth(authData, isGlobal);
      spinner.succeed(isGlobal ? '全局登录成功!' : '工作空间登录成功!');
      
      console.log(chalk.green('✔ ') + `欢迎, ${authData.username || authData.email}!`);
      console.log(chalk.blue('ℹ ') + (isGlobal ? 'Token 已加密保存到全局配置' : 'Token 已加密保存到当前工作空间'));
      
      logOperation('login_success', { username, global: isGlobal, userId: authData.userId });
      
    } catch (err) {
      spinner.fail('登录失败');
      console.log(chalk.red('✖ ') + (err instanceof FreelogError ? err.toString() : `登录失败: ${err.message}`));
      logError(err, { username, global: isGlobal });
      process.exit(1);
    }
    
  } catch (err) {
    console.log(chalk.red('✖ ') + `执行登录命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

// ==================== LOGOUT ====================

/**
 * 执行登出命令
 */
async function executeLogout(options) {
  try {
    logOperation('logout', { global: options.global });
    
    const scope = options.global ? '全局' : '工作空间';
    
    if (!isAuthenticated(options.global)) {
      console.log(chalk.yellow('⚠ ') + `${scope}未登录`);
      return;
    }
    
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: `确定要退出${scope}登录吗?`,
      default: true
    }]);
    
    if (!confirmed) {
      console.log(chalk.blue('ℹ ') + '已取消登出');
      return;
    }
    
    removeAuth(options.global);
    console.log(chalk.green('✔ ') + `${scope}登出成功`);
    logOperation('logout_success', { global: options.global });
    
  } catch (err) {
    console.error(`执行登出命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

// ==================== STATUS ====================

/**
 * 执行查看登录状态命令
 */
async function executeStatus(options) {
  try {
    logOperation('login_status', { global: options.global });
    
    const authStatus = getAllAuthStatus();
    
    if (options.global) {
      if (authStatus.global) {
        console.log('\n全局登录状态:');
        console.log(`  用户名: ${authStatus.global.username || authStatus.global.email}`);
        console.log(`  登录时间: ${new Date(authStatus.global.loginTime).toLocaleString()}`);
        console.log(`  Token 有效期: ${authStatus.global.expireDays} 天\n`);
      } else {
        console.log('\n全局登录: 未登录\n');
      }
    } else {
      printAuthStatus(authStatus);
    }
    
  } catch (err) {
    console.error(`执行查看登录状态命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

// ==================== EXPORTS ====================

module.exports = {
  executeLogin,
  executeLogout,
  executeStatus
};

