/**
 * 查询依赖列表命令
 */

const { readConfig } = require('../../core/config');
const { getDependencies } = require('../../core/api');
const { logOperation, logError } = require('../../core/logger');
const { startSpinner, succeedSpinner, failSpinner } = require('../../utils/spinner');
const { error, warning, title, printDependenciesTable } = require('../../utils/output');

/**
 * 执行查询依赖列表命令
 * @param {Object} options - 命令选项
 */
async function executeList(options) {
  try {
    logOperation('list_dependencies', options);
    
    // 1. 读取配置文件
    const config = readConfig(process.cwd(), true);
    
    if (!config.resource || !config.resource.resourceId) {
      error('配置文件中缺少资源ID');
      error('请先完善配置文件或执行 freelog-cli sync');
      process.exit(1);
    }
    
    // 2. 如果指定了远程查询
    if (options.remote) {
      const version = options.version || 'latest';
      title(`线上依赖列表 (${version})`);
      
      const spinner = startSpinner('正在获取线上依赖列表...');
      
      try {
        const remoteDeps = await getDependencies(config.resource.resourceId, version);
        succeedSpinner(`找到 ${remoteDeps.length} 个依赖`);
        
        if (remoteDeps.length === 0) {
          warning('该版本没有依赖');
          return;
        }
        
        console.log();
        printDependenciesTable(remoteDeps);
        
      } catch (err) {
        failSpinner('获取线上依赖列表失败');
        error(err.message);
        logError(err);
        process.exit(1);
      }
      
    } else {
      // 3. 显示本地依赖列表
      title(`本地依赖列表 (${config.version})`);
      
      if (!config.dependencies || config.dependencies.length === 0) {
        warning('当前没有任何依赖');
        return;
      }
      
      console.log();
      printDependenciesTable(config.dependencies);
      
      // 显示统计信息
      const authorizedCount = config.dependencies.filter(d => d.authStatus).length;
      const unauthorizedCount = config.dependencies.length - authorizedCount;
      
      console.log();
      console.log(`总计: ${config.dependencies.length} 个依赖`);
      console.log(`已授权: ${authorizedCount} 个`);
      console.log(`未授权: ${unauthorizedCount} 个`);
    }
    
  } catch (err) {
    error(`执行查询依赖列表命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

module.exports = executeList;

