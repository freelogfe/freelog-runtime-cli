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
const { selectVersion } = require('../../utils/version-selector');

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
    let spinner = startSpinner('正在获取资源信息...');
    let resourceInfo;
    
    try {
      const result = await getResource(parsed.value);
      if (!result || !result.data) {
        throw new Error('资源信息获取失败');
      }
      
      resourceInfo = result.data;
      succeedSpinner('资源信息获取成功');
      spinner = null;
      
      success(`资源名称: ${resourceInfo.resourceName}`);
      success(`资源类型: ${Array.isArray(resourceInfo.resourceType) ? resourceInfo.resourceType.join(', ') : resourceInfo.resourceType}`);
      info(`描述: ${resourceInfo.intro || '无'}`);
      
    } catch (err) {
      if (spinner) {
        failSpinner('获取资源信息失败');
        spinner = null;
      }
      
      if (err instanceof FreelogError) {
        error(err.toString());
      } else {
        error(`获取资源信息失败: ${err.message}`);
      }
      
      process.exit(1);
    }
    
    // 4. 确定版本
    let targetVersion = parsed.version || 'latest';
    
    // 如果指定了 --select-version 或 -sv，交互式选择版本
    if (options.selectVersion) {
      const selectedVersion = await selectVersion(
        resourceInfo.resourceId || resourceInfo._id,
        resourceInfo.resourceName
      );
      
      if (selectedVersion === null) {
        info('已取消添加依赖');
        process.exit(0);
      }
      
      targetVersion = selectedVersion;
      success(`已选择版本: ${targetVersion}`);
    } else if (!parsed.version) {
      // 原有逻辑：询问使用最新版本或手动输入
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
    let policySpinner = startSpinner('正在获取策略列表...');
    let policies;
    
    try {
      policies = await getPolicies(resourceInfo.resourceId);
      succeedSpinner(`找到 ${policies.length} 个可用策略`);
      policySpinner = null;
      
      if (policies.length === 0) {
        warning('该资源没有可用策略');
        process.exit(0);
      }
      
    } catch (err) {
      if (policySpinner) {
        failSpinner('获取策略列表失败');
        policySpinner = null;
      }
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
        let signSpinner = startSpinner('正在签约...');
        
        try {
          // 签约
          const contractResult = await signContract(selectedPolicyId, {
            resourceId: resourceInfo.resourceId,
            version: targetVersion
          });
          
          succeedSpinner('签约成功');
          signSpinner = null;
          
          const contractId = contractResult.contractId;
          policyId = selectedPolicyId;
          
          // 再次获取资源信息，检查授权状态
          info('正在检查授权状态...');
          const checkSpinner = startSpinner('正在验证授权...');
          
          try {
            const authCheckResult = await getResource(resourceInfo.resourceId);
            const authInfo = authCheckResult.data;
            
            // 检查是否已授权（这里简化处理，实际应该检查合约状态）
            // 假设 authInfo 中有 authStatus 或类似字段
            const isAuthorized = authInfo.authStatus === 'authorized' || 
                                authInfo.status === 2; // 2 可能表示已授权
            
            succeedSpinner('授权状态检查完成');
            
            if (isAuthorized) {
              // 已获得授权
              authStatus = true;
              success('✓ 已获得授权');
            } else {
              // 未获得授权，需要支付
              warning('未获得授权，需要支付费用');
              
              // 显示支付信息
              if (selectedPolicy.price && selectedPolicy.price > 0) {
                console.log('\n支付信息:');
                console.log(`  合约ID: ${contractId}`);
                console.log(`  资源: ${resourceInfo.resourceName}`);
                console.log(`  费用: ${selectedPolicy.price} 元`);
                console.log(`  策略: ${selectedPolicy.policyName}`);
                console.log();
                
                // 询问是否支付
                const { confirmPay } = await inquirer.prompt([
                  {
                    type: 'confirm',
                    name: 'confirmPay',
                    message: '是否立即支付?',
                    default: true
                  }
                ]);
                
                if (confirmPay) {
                  // 获取支付信息
                  const paymentInfo = await inquirer.prompt([
                    {
                      type: 'input',
                      name: 'accountId',
                      message: '请输入付款账户ID:',
                      validate: input => {
                        if (!input.trim()) {
                          return '账户ID不能为空';
                        }
                        return true;
                      }
                    },
                    {
                      type: 'password',
                      name: 'password',
                      message: '请输入支付密码（6位数字）:',
                      mask: '*',
                      validate: input => {
                        if (!input) {
                          return '支付密码不能为空';
                        }
                        if (!/^\d{6}$/.test(input)) {
                          return '支付密码必须是6位数字';
                        }
                        return true;
                      }
                    }
                  ]);
                  
                  // 执行支付
                  let paySpinner = startSpinner('正在处理支付...');
                  
                  try {
                    const { processPaymentEvent } = require('../../core/api');
                    
                    const paymentResult = await processPaymentEvent(contractId, {
                      eventId: `pay_${Date.now()}`, // 生成事件ID
                      accountId: paymentInfo.accountId,
                      transactionAmount: selectedPolicy.price,
                      password: paymentInfo.password
                    });
                    
                    if (paymentResult.data.status === 2) {
                      // 支付成功
                      succeedSpinner('支付成功');
                      paySpinner = null;
                      authStatus = true;
                      success('✓ 已获得授权');
                    } else if (paymentResult.data.status === 1) {
                      // 支付确认中
                      succeedSpinner('支付确认中');
                      paySpinner = null;
                      info('支付正在处理，请稍后查看授权状态');
                      authStatus = false;
                    } else if (paymentResult.data.status === 4) {
                      // 支付失败
                      if (paySpinner) {
                        failSpinner('支付失败');
                        paySpinner = null;
                      }
                      warning(`支付失败: ${paymentResult.data.msg || '未知错误'}`);
                      authStatus = false;
                    } else {
                      if (paySpinner) {
                        failSpinner('支付状态未知');
                        paySpinner = null;
                      }
                      warning('支付状态异常，请检查账户');
                      authStatus = false;
                    }
                  } catch (payErr) {
                    if (paySpinner) {
                      failSpinner('支付失败');
                      paySpinner = null;
                    }
                    error(`支付错误: ${payErr.message}`);
                    
                    // 显示具体错误信息
                    if (payErr.response && payErr.response.data) {
                      const errorData = payErr.response.data;
                      switch (errorData.code) {
                      case 'E1009':
                        error('余额不足，请充值后重试');
                        break;
                      case 'E1010':
                        error('支付密码错误，请重新输入');
                        break;
                      case 'E1005':
                        error('账户被冻结，请联系客服');
                        break;
                      case 'E1004':
                        error('账户未找到，请检查账户ID');
                        break;
                      default:
                        error(`错误: ${errorData.msg || '未知错误'}`);
                      }
                    }
                    
                    authStatus = false;
                    warning('将以未授权状态添加依赖');
                  }
                } else {
                  // 用户不支付
                  info('跳过支付，将以未授权状态添加依赖');
                  authStatus = false;
                }
              } else {
                // 免费策略但未授权（异常情况）
                warning('策略为免费但未获得授权，可能需要等待审核');
                authStatus = false;
              }
            }
          } catch (checkErr) {
            if (checkSpinner) {
              failSpinner('授权检查失败');
            }
            warning(`无法验证授权状态: ${checkErr.message}`);
            warning('将以未授权状态添加依赖');
            authStatus = false;
          }
          
        } catch (err) {
          if (signSpinner) {
            failSpinner('签约失败');
            signSpinner = null;
          }
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
    
    let saveSpinner = startSpinner('正在保存配置...');
    
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
      saveSpinner = null;
      
      success(`依赖添加成功: ${resourceInfo.resourceName}@${targetVersion}`);
      
      logOperation('add_dependency_success', {
        resourceId: resourceInfo.resourceId,
        version: targetVersion,
        policyId
      });
      
    } catch (err) {
      if (saveSpinner) {
        failSpinner('保存配置失败');
        saveSpinner = null;
      }
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

