/**
 * 查看登录状态命令
 */

const { getAllAuthStatus } = require('../../core/auth');
const { logOperation, logError } = require('../../core/logger');
const { printAuthStatus } = require('../../utils/output');

/**
 * 执行查看登录状态命令
 * @param {Object} options - 命令选项
 */
async function executeStatus(options) {
  try {
    logOperation('login_status', { global: options.global });
    
    const authStatus = getAllAuthStatus();
    
    // 如果指定了只查看全局登录
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
      // 显示全部登录状态
      printAuthStatus(authStatus);
    }
    
  } catch (err) {
    console.error(`执行查看登录状态命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

module.exports = executeStatus;

