/**
 * 添加依赖命令
 * 
 * 功能：
 * 1. 获取资源信息
 * 2. 处理上抛资源（baseUpcastResources）的签约和支付
 * 3. 处理主资源的签约和支付
 * 4. 保存依赖到配置文件
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { requireAuth } from '../../core/auth';
import { addDependency } from '../../services/dependencyService';
import { loadResourceConfig } from '../../services/resourceConfigService';
import { processPayment } from '../../services/paymentService';
import { getResourceInfo, getResourceVersionInfoList } from '../../api/resourceGet';
import { createContract } from '../../api/contract';
import { checkResourceAuth } from '../../api/auth';
import type { PolicyInfo } from "../../api/responseTypes";

import { CommandOptions } from '../../types';
import type { Dependency } from '../../../public/freelog.version';
import type { ResourceDetailResponse } from '../../api/responseTypes';

/**
 * 解析资源标识符
 * @example "resourceId@1.0.0" => { value: "resourceId", version: "1.0.0" }
 */
function parseResourceIdentifier(identifier: string): { value: string; version?: string } {
  const parts = identifier.split('@');
  return parts.length === 1 ? { value: parts[0] } : { value: parts[0], version: parts[1] };
}

/**
 * 处理单个资源的签约和支付
 * @param resourceInfo 资源信息
 * @param resourceName 资源名称（用于显示）
 * @param isUpcastResource 是否为上抛资源
 * @param hasUpcastResources 主资源是否有上抛资源（如果有，不允许跳过签约）
 * @returns 是否成功授权
 */
async function processResourceContract(
  resourceInfo: ResourceDetailResponse,
  resourceName: string,
  isUpcastResource: boolean = false,
  hasUpcastResources: boolean = false
): Promise<boolean> {
  const prefix = isUpcastResource ? '  [上抛] ' : '';
  
  console.log(chalk.bold.cyan(`\n${prefix}${resourceName}`));
  console.log(`${prefix}资源ID: ${resourceInfo.resourceId}`);
  console.log(`${prefix}类型: ${Array.isArray(resourceInfo.resourceType) ? resourceInfo.resourceType.join(', ') : resourceInfo.resourceType}`);
  
  // 检查是否已经授权
  const authSpinner = ora(`${prefix}正在检查授权状态...`).start();
  try {
    const authResult = await checkResourceAuth(resourceInfo.resourceId, resourceInfo.latestVersion);
    
    if (authResult.isAuth) {
      authSpinner.succeed(`${prefix}已授权 (版本: ${authResult.version})`);
      console.log(chalk.green(`✔ ${prefix}该资源已获得授权，跳过签约和支付`));
      return true;
    } else {
      authSpinner.info(`${prefix}未授权，需要签约`);
    }
  } catch (err: any) {
    authSpinner.warn(`${prefix}无法检查授权状态，将继续签约流程`);
  }
  
  // 如果主资源有上抛资源，提示必须签约
  if (hasUpcastResources && !isUpcastResource) {
    console.log(chalk.yellow(`\n⚠️ 此资源有上抛资源依赖，必须完成签约才能使用`));
  }
  
  // 获取策略列表（通过 getResourceInfo 加载策略信息）
  const spinner = ora(`${prefix}正在获取策略列表...`).start();
  let policies: PolicyInfo[] = [];
  
  try {
    const resourceWithPolicies = await getResourceInfo(resourceInfo.resourceId, { isLoadPolicyInfo: 1 });
    policies = resourceWithPolicies.policies || [];
    spinner.succeed(`${prefix}找到 ${policies.length} 个可用策略`);
    
    if (policies.length === 0) {
      console.log(chalk.yellow(`⚠ ${prefix}该资源没有可用策略，跳过`));
      return false;
    }
  } catch (err: any) {
    spinner.fail(`${prefix}获取策略列表失败`);
    console.log(chalk.red(`✖ ${prefix}${err.message}`));
    return false;
  }
  
  // 选择策略
  const policyChoices = policies.map(policy => ({
    name: `${policy.policyName} ${policy.translateInfo?.content || ''}`,
    value: policy.policyId,
    short: policy.policyName
  }));
  
  // 只有在没有上抛资源或者是上抛资源本身时，才允许跳过
  if (!hasUpcastResources || isUpcastResource) {
    policyChoices.push({
      name: '跳过（不签约）',
      value: 'skip',
      short: '跳过'
    });
  }
  
  const { selectedPolicyId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedPolicyId',
      message: `${prefix}请选择策略:`,
      choices: policyChoices
    }
  ]);
  
  if (selectedPolicyId === 'skip') {
    console.log(chalk.blue(`ℹ ${prefix}跳过签约`));
    return false;
  }
  
  // 签约
  const selectedPolicy = policies.find(p => p.policyId === selectedPolicyId)!;
  
  const { confirmSign } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmSign',
      message: `${prefix}确认签约策略 "${selectedPolicy.policyName}"?`,
      default: true
    }
  ]);
  
  if (!confirmSign) {
    console.log(chalk.blue(`ℹ ${prefix}取消签约`));
    return false;
  }
  
  const signSpinner = ora(`${prefix}正在签约...`).start();
  
  try {
    const contractResult = await createContract(resourceInfo.resourceId, selectedPolicyId);
    signSpinner.succeed(`${prefix}签约成功`);
    
    const contractId = contractResult.contractId;
    
    // 检查签约后的授权状态
    // authStatus: 1-正式授权 2-测试授权 128-未获得授权
    if (contractResult.authStatus === 1 || contractResult.authStatus === 2) {
      const authType = contractResult.authStatus === 1 ? '正式授权' : '测试授权';
      console.log(chalk.green(`✔ ${prefix}签约成功，已获得${authType}`));
      return true;
    }
    
    // 未获得授权，需要支付
    console.log(chalk.yellow(`\n${prefix}签约成功但未获得授权，需要完成支付`));
    
    const { confirmPay } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmPay',
        message: `${prefix}是否立即支付?`,
        default: true
      }
    ]);
    
    if (confirmPay) {
      try {
        await processPayment(contractId);
        console.log(chalk.green(`✔ ${prefix}支付成功，已获得授权`));
        return true;
      } catch (payErr: any) {
        console.log(chalk.red(`✖ ${prefix}支付失败: ${payErr.message}`));
        return false;
      }
    } else {
      console.log(chalk.blue(`ℹ ${prefix}跳过支付，依赖将处于未授权状态`));
      return false;
    }
  } catch (err: any) {
    signSpinner.fail(`${prefix}签约失败`);
    console.log(chalk.red(`✖ ${prefix}${err.message}`));
    return false;
  }
}

/**
 * 处理上抛资源
 * @param baseUpcastResources 上抛资源列表
 */
async function processBaseUpcastResources(
  baseUpcastResources: Array<{ resourceId: string; resourceName: string }>
): Promise<void> {
  if (!baseUpcastResources || baseUpcastResources.length === 0) {
    return;
  }
  
  console.log(chalk.bold.yellow(`\n⚠️ 检测到 ${baseUpcastResources.length} 个上抛资源`));
  console.log(chalk.gray('上抛资源是依赖资源声明的基础授权资源，必须获得授权才能使用依赖资源。\n'));
  
  for (const upcastResource of baseUpcastResources) {
    try {
      // 获取上抛资源详情
      const spinner = ora(`正在获取上抛资源信息: ${upcastResource.resourceName}`).start();
      const resourceInfo = await getResourceInfo(upcastResource.resourceId);
      spinner.succeed(`上抛资源信息获取成功: ${upcastResource.resourceName}`);
      
      // 处理上抛资源的签约和支付
      await processResourceContract(resourceInfo, upcastResource.resourceName, true);
      
    } catch (err: any) {
      console.log(chalk.red(`✖ 处理上抛资源失败: ${upcastResource.resourceName} - ${err.message}`));
      console.log(chalk.yellow('⚠️ 跳过此上抛资源，可能导致依赖资源无法使用'));
    }
  }
}

/**
 * 执行添加依赖命令
 */
export async function executeAdd(resourceIdentifier: string, options: CommandOptions = {}): Promise<void> {
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
    console.log(chalk.cyan('\n=== 添加依赖 ==='));
    console.log(chalk.blue('ℹ ') + `资源标识: ${parsed.value}`);
    if (parsed.version) {
      console.log(chalk.blue('ℹ ') + `指定版本: ${parsed.version}`);
    }
    
    // 3. 获取资源信息
    const spinner = ora('正在获取资源信息...').start();
    let resourceInfo: ResourceDetailResponse;
    
    try {
      resourceInfo = await getResourceInfo(parsed.value);
      spinner.succeed('资源信息获取成功');
      
      console.log(chalk.green('✔ ') + `资源名称: ${resourceInfo.resourceName}`);
      console.log(chalk.green('✔ ') + `资源类型: ${Array.isArray(resourceInfo.resourceType) ? resourceInfo.resourceType.join(', ') : resourceInfo.resourceType}`);
      if (resourceInfo.intro) {
        console.log(chalk.blue('ℹ ') + `描述: ${resourceInfo.intro}`);
      }
      
    } catch (err: any) {
      spinner.fail('获取资源信息失败');
      console.log(chalk.red('✖ ') + `${err.message}`);
      process.exit(1);
    }
    
    // 4. 确定版本
    let targetVersion = parsed.version || '*';
    
    if (!parsed.version) {
      const { useLatest } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useLatest',
          message: '是否使用最新版本 (*)?',
          default: true
        }
      ]);
      
      if (!useLatest) {
        try {
          const versionSpinner = ora('正在获取版本列表...').start();
          const versions = await getResourceVersionInfoList(parsed.value);
          versionSpinner.succeed(`找到 ${versions.length} 个版本`);
          
          if (versions.length > 0) {
            const { version } = await inquirer.prompt([
              {
                type: 'list',
                name: 'version',
                message: '请选择版本:',
                choices: versions.map((v: any) => ({
                  name: `${v.version} (${new Date(v.createDate).toLocaleDateString()})`,
                  value: v.version,
                  short: v.version
                }))
              }
            ]);
            targetVersion = `^${version}`;
          } else {
            console.log(chalk.yellow('⚠️ 未找到可用版本，使用 *'));
          }
        } catch (err: any) {
          console.log(chalk.yellow(`⚠️ 获取版本列表失败: ${err.message}，使用 *`));
        }
      }
    }
    
    // 5. 检查是否已存在
    const { getDependency: checkDep } = await import('../../services/dependencyService');
    const existingDep = await checkDep(resourceInfo.resourceId, options.config).catch(() => undefined);
    
    if (existingDep) {
      console.log(chalk.yellow('⚠️ ') + `依赖已存在，当前版本: ${existingDep.versionRange}`);
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: '是否覆盖现有依赖?',
          default: false
        }
      ]);
      
      if (!overwrite) {
        console.log(chalk.blue('ℹ️ ') + '已取消添加');
        return;
      }
    }
    
    // 6. 检查是否有上抛资源
    const hasUpcastResources = !!(resourceInfo.baseUpcastResources && resourceInfo.baseUpcastResources.length > 0);
    
    // 7. 处理上抛资源（如果存在）
    if (hasUpcastResources) {
      await processBaseUpcastResources(resourceInfo.baseUpcastResources);
    }
    
    // 8. 处理主资源的签约和支付
    await processResourceContract(resourceInfo, resourceInfo.resourceName, false, hasUpcastResources);
    
    // 9. 添加依赖到版本配置文件
    const newDependency: Dependency = {
      resourceId: resourceInfo.resourceId,
      resourceName: resourceInfo.resourceName,
      versionRange: targetVersion,
    };
    
    const saveSpinner = ora('正在保存配置...').start();
    
    try {
      await addDependency(newDependency, options.config);
      
      saveSpinner.succeed('配置保存成功');
      
      console.log(chalk.green('\n✔️ ') + `依赖添加成功: ${resourceInfo.resourceName}`);
      console.log(chalk.blue('ℹ️ ') + `版本范围: ${newDependency.versionRange}`);
      console.log(chalk.gray('\n提示: 请确保完成所有必要的签约和支付，否则依赖资源可能无法使用。'));
      
    } catch (err: any) {
      saveSpinner.fail('保存配置失败');
      console.log(chalk.red('✖️ ') + err.message);
      process.exit(1);
    }
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `执行添加依赖命令失败: ${err.message}`);
    process.exit(1);
  }
}

