/**
 * 删除依赖命令
 */

const inquirer = require('inquirer');
const { readConfig, updateConfig } = require('../../core/config');
const { logOperation, logError } = require('../../core/logger');
const { success, error, warning, info } = require('../../utils/output');
const { parseResourceIdentifier } = require('../../utils/validator');

/**
 * 执行删除依赖命令
 * @param {Array<string>} resourceIdentifiers - 资源标识符列表
 * @param {Object} options - 命令选项
 */
async function executeRemove(resourceIdentifiers, options) {
  try {
    logOperation('remove_dependency', { resourceIdentifiers, options });
    
    // 1. 读取配置文件
    const config = readConfig(process.cwd(), true);
    
    if (!config.dependencies || config.dependencies.length === 0) {
      warning('当前没有任何依赖');
      return;
    }
    
    // 2. 解析资源标识符
    const parsedIdentifiers = resourceIdentifiers.map(id => {
      const parsed = parseResourceIdentifier(id);
      return parsed.value;
    });
    
    // 3. 查找要删除的依赖
    const toRemove = [];
    const notFound = [];
    
    parsedIdentifiers.forEach(identifier => {
      const dep = config.dependencies.find(
        d => d.resourceId === identifier || d.name === identifier
      );
      
      if (dep) {
        toRemove.push(dep);
      } else {
        notFound.push(identifier);
      }
    });
    
    // 4. 显示未找到的依赖
    if (notFound.length > 0) {
      warning(`以下依赖未找到:`);
      notFound.forEach(id => {
        console.log(`  - ${id}`);
      });
    }
    
    // 5. 如果没有要删除的依赖
    if (toRemove.length === 0) {
      error('没有找到要删除的依赖');
      return;
    }
    
    // 6. 显示要删除的依赖
    console.log('\n将要删除以下依赖:');
    toRemove.forEach(dep => {
      console.log(`  - ${dep.name} (${dep.version})`);
    });
    console.log();
    
    // 7. 确认删除
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `确定要删除 ${toRemove.length} 个依赖吗?`,
        default: false
      }
    ]);
    
    if (!confirmed) {
      info('已取消删除');
      return;
    }
    
    // 8. 执行删除
    const resourceIdsToRemove = toRemove.map(dep => dep.resourceId);
    config.dependencies = config.dependencies.filter(
      dep => !resourceIdsToRemove.includes(dep.resourceId)
    );
    
    // 9. 保存配置
    try {
      updateConfig(config);
      
      success(`成功删除 ${toRemove.length} 个依赖`);
      
      toRemove.forEach(dep => {
        info(`  ✓ ${dep.name}`);
      });
      
      logOperation('remove_dependency_success', {
        removed: toRemove.map(d => d.resourceId)
      });
      
    } catch (err) {
      error(`保存配置失败: ${err.message}`);
      logError(err);
      process.exit(1);
    }
    
  } catch (err) {
    error(`执行删除依赖命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

module.exports = executeRemove;

