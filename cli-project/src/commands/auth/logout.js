/**
 * 登出命令
 */

const inquirer = require('inquirer');
const { removeAuth, isAuthenticated } = require('../../core/auth');
const { logOperation, logError } = require('../../core/logger');
const { success, warning, info } = require('../../utils/output');

/**
 * 执行登出命令
 * @param {Object} options - 命令选项
 */
async function executeLogout(options) {
  try {
    logOperation('logout', { global: options.global });
    
    const scope = options.global ? '全局' : '工作空间';
    
    // 检查是否已登录
    if (!isAuthenticated(options.global)) {
      warning(`${scope}未登录`);
      return;
    }
    
    // 确认登出
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `确定要退出${scope}登录吗?`,
        default: true
      }
    ]);
    
    if (!confirmed) {
      info('已取消登出');
      return;
    }
    
    // 执行登出
    removeAuth(options.global);
    
    success(`${scope}登出成功`);
    
    logOperation('logout_success', { global: options.global });
    
  } catch (err) {
    console.error(`执行登出命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

module.exports = executeLogout;

