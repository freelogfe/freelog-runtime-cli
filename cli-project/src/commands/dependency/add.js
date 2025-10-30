/**
 * 添加依赖命令
 */

const inquirer = require('inquirer');
const { requireAuth } = require('../../core/auth');
const { readConfig, updateConfig } = require('../../core/config');
const { getResource, getPolicies, signContract } = require('../../core/api');
const { logOperation, logError } = require('../../core/logger');
const { startSpinner, succeedSpinner, failSpinner } = require('../../utils/spinner');
const { success, error, warning, info, title } = require('../../utils/output');
const { parseResourceIdentifier, validateDependency } = require('../../utils/validator');
const { FreelogError } = require('../../constants/errors');

/**
 * 执行添加依赖命令
 * @param {string} resourceIdentifier - 资源标识符
 * @param {Object} options - 命令选项
 */
async function executeAdd(resourceIdentifier, options) {
  try {
    logOperation('add_dependency', { resourceIdentifier, options });
    
    // 1. 检查登录状态
    try {
      requireAuth();
    } catch (err) {
      error(err.toString());
      process.exit(1);
    }
    
    // 2. 解析资源标识符
    const parsed = parseResourceIdentifier(resourceIdentifier);
    info(`正在添加依赖: ${parsed.value}`);
    if (parsed.version) {
      info(`版本: ${parsed.version}`);
    }
    
    // 3. 获取资源信息
    const spinner = startSpinner('正在获取资源信息...');
    let resourceInfo;
    
    try {
      resourceInfo = await getResource(parsed.value);
      succeedSpinner('资源信息获取成功');
      
      success(`资源名称: ${resourceInfo.resourceName}`);
      success(`资源类型: ${resourceInfo.resourceType}`);
      info(`描述: ${resourceInfo.description || '无'}`);
      
    } catch (err) {
      failSpinner('获取资源信息失败');
      
      if (err instanceof FreelogError) {
        error(err.toString());
      } else {
        error(`获取资源信息失败: ${err.message}`);
      }
      
      process.exit(1);
    }
    
    // 4. 确定版本
    let targetVersion = parsed.version || 'latest';
    
    if (!parsed.version) {
      const { useLatest } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useLatest',
          message: '是否使用最新版本?',
          default: true
        }
      ]);
      
      if (!useLatest) {
        const { version } = await inquirer.prompt([
          {
            type: 'input',
            name: 'version',
            message: '请输入版本号:',
            validate: input => input ? true : '版本号不能为空'
          }
        ]);
        targetVersion = version;
      }
    }
    
    // 5. 检查是否已存在
    const config = readConfig();
    if (config) {
      const existingDep = config.dependencies?.find(
        dep => dep.resourceId === resourceInfo.resourceId
      );
      
      if (existingDep) {
        warning(`依赖已存在，当前版本: ${existingDep.version}`);
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: '是否覆盖现有依赖?',
            default: false
          }
        ]);
        
        if (!overwrite) {
          info('已取消添加');
          return;
        }
      }
    }
    
    // 6. 获取可用策略
    title('可用策略');
    const policySpinner = startSpinner('正在获取策略列表...');
    let policies;
    
    try {
      policies = await getPolicies(resourceInfo.resourceId);
      succeedSpinner(`找到 ${policies.length} 个可用策略`);
      
      if (policies.length === 0) {
        warning('该资源没有可用策略');
        process.exit(0);
      }
      
    } catch (err) {
      failSpinner('获取策略列表失败');
      error(err.message);
      process.exit(1);
    }
    
    // 7. 选择策略
    const policyChoices = policies.map(policy => ({
      name: `${policy.policyName} - ${policy.description || '无描述'}`,
      value: policy.policyId,
      short: policy.policyName
    }));
    
    policyChoices.push({
      name: '上抛（不签约）',
      value: 'bubble',
      short: '上抛'
    });
    
    const { selectedPolicyId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedPolicyId',
        message: '请选择策略:',
        choices: policyChoices
      }
    ]);
    
    let policyId = null;
    let authStatus = false;
    
    // 8. 签约流程
    if (selectedPolicyId !== 'bubble') {
      const selectedPolicy = policies.find(p => p.policyId === selectedPolicyId);
      
      // 显示策略详情
      console.log('\n策略详情:');
      console.log(`  名称: ${selectedPolicy.policyName}`);
      console.log(`  费用: ${selectedPolicy.price || '免费'}`);
      console.log(`  说明: ${selectedPolicy.description || '无'}`);
      console.log();
      
      const { confirmSign } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmSign',
          message: '确认签约此策略?',
          default: true
        }
      ]);
      
      if (confirmSign) {
        const signSpinner = startSpinner('正在签约...');
        
        try {
          await signContract(selectedPolicyId, {
            resourceId: resourceInfo.resourceId,
            version: targetVersion
          });
          
          policyId = selectedPolicyId;
          authStatus = true;
          
          succeedSpinner('签约成功');
        } catch (err) {
          failSpinner('签约失败');
          warning('将以未授权状态添加依赖');
        }
      }
    } else {
      info('选择上抛，依赖将不进行签约');
    }
    
    // 9. 添加依赖到配置文件
    const newDependency = {
      resourceId: resourceInfo.resourceId,
      name: resourceInfo.resourceName,
      version: targetVersion,
      versionRange: targetVersion === 'latest' ? '*' : `^${targetVersion}`,
      policyId: policyId,
      authStatus: authStatus
    };
    
    try {
      validateDependency(newDependency);
    } catch (err) {
      error(`依赖验证失败: ${err.message}`);
      process.exit(1);
    }
    
    const saveSpinner = startSpinner('正在保存配置...');
    
    try {
      if (!config) {
        error('配置文件不存在，请先执行 freelog-cli sync 初始化');
        process.exit(1);
      }
      
      if (!config.dependencies) {
        config.dependencies = [];
      }
      
      // 删除旧依赖（如果存在）
      config.dependencies = config.dependencies.filter(
        dep => dep.resourceId !== resourceInfo.resourceId
      );
      
      // 添加新依赖
      config.dependencies.push(newDependency);
      
      updateConfig(config);
      
      succeedSpinner('配置保存成功');
      
      success(`依赖添加成功: ${resourceInfo.resourceName}@${targetVersion}`);
      
      logOperation('add_dependency_success', {
        resourceId: resourceInfo.resourceId,
        version: targetVersion,
        policyId
      });
      
    } catch (err) {
      failSpinner('保存配置失败');
      error(err.message);
      logError(err);
      process.exit(1);
    }
    
  } catch (err) {
    error(`执行添加依赖命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

module.exports = executeAdd;

