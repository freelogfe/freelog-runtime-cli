/**
 * 认证命令模块入口
 */

const executeLogin = require('./login');
const executeLogout = require('./logout');
const executeStatus = require('./status');

module.exports = {
  executeLogin,
  executeLogout,
  executeStatus
};

