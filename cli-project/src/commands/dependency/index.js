/**
 * 依赖管理命令模块入口
 */

const executeAdd = require('./add');
const executeRemove = require('./remove');
const executeList = require('./list');

module.exports = {
  executeAdd,
  executeRemove,
  executeList
};

