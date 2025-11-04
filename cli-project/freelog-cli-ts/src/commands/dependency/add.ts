/**
 * 添加依赖命令 - 完整版（包含策略、签约、支付）
 */

import inquirer from 'inquirer';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import apiClient from '../../core/api';
import { requireAuth } from '../../core/auth';
import { readConfig, updateConfig } from '../../core/config';
import { CommandOptions } from '../../types';

// 解析资源标识符
function parseResourceIdentifier(identifier: string): { value: string; version?: string } {
  const parts = identifier.split('@');
  return parts.length === 1 ? { value: parts[0] } : { value: parts[0], version: parts[1] };
}

// 验证依赖
function validateDependency(dep: any): boolean {
  return !!(dep.resourceId && dep.name && dep.version);
}

// 获取策略列表
async function getPolicies(resourceId: string): Promise<any[]> {
  const response = await apiClient.get(`/v2/resources/${resourceId}/policies`);
  return response.data.data || [];
}

// 签约
async function signContract(policyId: string, data: any): Promise<any> {
  const response = await apiClient.post(`/v2/contracts`, {
    policyId,
    ...data
  });
  return response.data.data;
}

export async function executeAdd(resourceIdentifier: string, options: CommandOptions): Promise<void> {
  try {
    // 1. 检查登录
    try {
      requireAuth();
    } catch (err: any) {
      console.log(chalk.red('✖ ') + err.toString());
      process.exit(1);
    }
    
    // 2. 解析资源标识符
    const parsed = parseResourceIdentifier(resourceIdentifier);
    console.log(chalk.blue('ℹ ') + `正在添加依赖: ${parsed.value}`);
    if (parsed.version) {
      console.log(chalk.blue('ℹ ') + `版本: ${parsed.version}`);
    }
    
    // 3. 获取资源信息
    let spinner: Ora | null = ora('正在获取资源信息...').start();
    let resourceInfo: any;
    
    try {
      const response = await apiClient.get(`/v2/resources/${parsed.value}`);
      if (!response || !response.data || !response.data.data) {
        throw new Error('资源信息获取失败');
      }
      
      resourceInfo = response.data.data;
      spinner.succeed('资源信息获取成功');
      spinner = null;
      
      console.log(chalk.green('✔ ') + `资源名称: ${resourceInfo.resourceName}`);
      console.log(chalk.green('✔ ') + `资源类型: ${Array.isArray(resourceInfo.resourceType) ? resourceInfo.resourceType.join(', ') : resourceInfo.resourceType}`);
      console.log(chalk.blue('ℹ ') + `描述: ${resourceInfo.intro || '无'}`);
      
    } catch (err: any) {
      if (spinner) {
        spinner.fail('获取资源信息失败');
      }
      console.log(chalk.red('✖ ') + `获取资源信息失败: ${err.message}`);
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
            validate: (input: string) => input ? true : '版本号不能为空'
          }
        ]);
        targetVersion = version;
      }
    }
    
    // 5. 检查是否已存在
    const config = readConfig();
    if (config) {
      const existingDep = config.dependencies?.find(
        (dep: any) => dep.resourceId === resourceInfo.resourceId
      );
      
      if (existingDep) {
        console.log(chalk.yellow('⚠ ') + `依赖已存在，当前版本: ${existingDep.version}`);
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: '是否覆盖现有依赖?',
            default: false
          }
        ]);
        
        if (!overwrite) {
          console.log(chalk.blue('ℹ ') + '已取消添加');
          return;
        }
      }
    }
    
    // 6. 获取可用策略
    console.log(chalk.bold.cyan('\n可用策略'));
    let policySpinner: Ora | null = ora('正在获取策略列表...').start();
    let policies: any[];
    
    try {
      policies = await getPolicies(resourceInfo.resourceId);
      policySpinner.succeed(`找到 ${policies.length} 个可用策略`);
      policySpinner = null;
      
      if (policies.length === 0) {
        console.log(chalk.yellow('⚠ ') + '该资源没有可用策略');
        process.exit(0);
      }
      
    } catch (err: any) {
      if (policySpinner) {
        policySpinner.fail('获取策略列表失败');
      }
      console.log(chalk.red('✖ ') + err.message);
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
    
    let policyId: string | null = null;
    let authStatus = false;
    
    // 8. 签约流程
    if (selectedPolicyId !== 'bubble') {
      const selectedPolicy = policies.find(p => p.policyId === selectedPolicyId);
      
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
        let signSpinner: Ora | null = ora('正在签约...').start();
        
        try {
          const contractResult = await signContract(selectedPolicyId, {
            resourceId: resourceInfo.resourceId,
            version: targetVersion
          });
          
          signSpinner.succeed('签约成功');
          signSpinner = null;
          
          const contractId = contractResult.contractId;
          policyId = selectedPolicyId;
          
          // 检查授权状态
          console.log(chalk.blue('ℹ ') + '正在检查授权状态...');
          const checkSpinner: Ora | null = ora('正在验证授权...').start();
          
          try {
            const authCheckResponse = await apiClient.get(`/v2/resources/${resourceInfo.resourceId}`);
            const authInfo = authCheckResponse.data.data;
            
            const isAuthorized = authInfo.authStatus === 'authorized' || authInfo.status === 2;
            
            checkSpinner.succeed('授权状态检查完成');
            
            if (isAuthorized) {
              authStatus = true;
              console.log(chalk.green('✔ ') + '✓ 已获得授权');
            } else {
              console.log(chalk.yellow('⚠ ') + '未获得授权，需要支付费用');
              
              if (selectedPolicy.price && selectedPolicy.price > 0) {
                console.log('\n支付信息:');
                console.log(`  合约ID: ${contractId}`);
                console.log(`  资源: ${resourceInfo.resourceName}`);
                console.log(`  费用: ${selectedPolicy.price} 元`);
                console.log(`  策略: ${selectedPolicy.policyName}`);
                console.log();
                
                const { confirmPay } = await inquirer.prompt([
                  {
                    type: 'confirm',
                    name: 'confirmPay',
                    message: '是否立即支付?',
                    default: true
                  }
                ]);
                
                if (confirmPay) {
                  const paymentInfo = await inquirer.prompt([
                    {
                      type: 'input',
                      name: 'accountId',
                      message: '请输入付款账户ID:',
                      validate: (input: string) => input.trim() ? true : '账户ID不能为空'
                    },
                    {
                      type: 'password',
                      name: 'password',
                      message: '请输入支付密码（6位数字）:',
                      mask: '*',
                      validate: (input: string) => {
                        if (!input) return '支付密码不能为空';
                        if (!/^\d{6}$/.test(input)) return '支付密码必须是6位数字';
                        return true;
                      }
                    }
                  ]);
                  
                  let paySpinner: Ora | null = ora('正在处理支付...').start();
                  
                  try {
                    const paymentResult = await apiClient.post(`/v2/contracts/${contractId}/payment-events`, {
                      eventId: `pay_${Date.now()}`,
                      accountId: paymentInfo.accountId,
                      transactionAmount: selectedPolicy.price,
                      password: paymentInfo.password
                    });
                    
                    if (paymentResult.data.status === 2) {
                      paySpinner.succeed('支付成功');
                      authStatus = true;
                      console.log(chalk.green('✔ ') + '✓ 已获得授权');
                    } else if (paymentResult.data.status === 1) {
                      paySpinner.succeed('支付确认中');
                      console.log(chalk.blue('ℹ ') + '支付正在处理，请稍后查看授权状态');
                    } else {
                      paySpinner.fail('支付失败');
                      console.log(chalk.yellow('⚠ ') + `支付失败: ${paymentResult.data.msg || '未知错误'}`);
                    }
                  } catch (payErr: any) {
                    if (paySpinner) paySpinner.fail('支付失败');
                    console.log(chalk.red('✖ ') + `支付错误: ${payErr.message}`);
                    console.log(chalk.yellow('⚠ ') + '将以未授权状态添加依赖');
                  }
                } else {
                  console.log(chalk.blue('ℹ ') + '跳过支付，将以未授权状态添加依赖');
                }
              }
            }
          } catch (checkErr: any) {
            if (checkSpinner) checkSpinner.fail('授权检查失败');
            console.log(chalk.yellow('⚠ ') + `无法验证授权状态: ${checkErr.message}`);
            console.log(chalk.yellow('⚠ ') + '将以未授权状态添加依赖');
          }
          
        } catch (err: any) {
          if (signSpinner) signSpinner.fail('签约失败');
          console.log(chalk.yellow('⚠ ') + '将以未授权状态添加依赖');
        }
      }
    } else {
      console.log(chalk.blue('ℹ ') + '选择上抛，依赖将不进行签约');
    }
    
    // 9. 添加依赖到配置文件
    const newDependency = {
      resourceId: resourceInfo.resourceId,
      name: resourceInfo.resourceName,
      version: targetVersion,
      versionRange: targetVersion === 'latest' ? '*' : `^${targetVersion}`,
      policyId,
      authStatus
    };
    
    if (!validateDependency(newDependency)) {
      console.log(chalk.red('✖ ') + '依赖验证失败');
      process.exit(1);
    }
    
    let saveSpinner: Ora | null = ora('正在保存配置...').start();
    
    try {
      if (!config) {
        console.log(chalk.red('✖ ') + '配置文件不存在，请先执行 freelog-cli sync 初始化');
        process.exit(1);
      }
      
      if (!config.dependencies) {
        config.dependencies = [];
      }
      
      config.dependencies = config.dependencies.filter(
        (dep: any) => dep.resourceId !== resourceInfo.resourceId
      );
      
      config.dependencies.push(newDependency);
      
      updateConfig(config);
      
      saveSpinner.succeed('配置保存成功');
      
      console.log(chalk.green('✔ ') + `依赖添加成功: ${resourceInfo.resourceName}@${targetVersion}`);
      
    } catch (err: any) {
      if (saveSpinner) saveSpinner.fail('保存配置失败');
      console.log(chalk.red('✖ ') + err.message);
      process.exit(1);
    }
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `执行添加依赖命令失败: ${err.message}`);
    process.exit(1);
  }
}

