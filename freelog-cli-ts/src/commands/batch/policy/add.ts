/**
 * batch policy add 命令
 * 为批量配置中的某个资源添加策略
 */

import path from 'path';
import fs from 'fs-extra';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../../types';
import { requireAuth } from '../../../core/auth';
import { confirmAuth } from '../../../utils/authConfirm';
import {
  loadBatchResourceConfig,
  batchItemToResourceConfig,
  getBatchResourceConfigPath,
} from '../../../services/batchResourceService';
import type { BatchResourceItemConfig } from '../../../../public/freelog.batch-resources';
import {
  loadResourceConfig,
  saveResourceConfig,
  calculatePolicyChanges,
  resourceConfigToUpdateBody,
} from '../../../services/resourceConfigService';
import {
  addPolicy,
  type PolicyConfigOperations,
} from '../../../services/policyService';
import type { ResourceConfig } from '../../../../public/freelog.resource';
import type { ResourceDetailResponse } from '../../../api/types';
import { handleErrorAndExit } from '../../../utils/errorHandler';

/**
 * 执行 batch policy add 命令
 */
export async function executeBatchPolicyAdd(
  resourceName: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 为批量资源添加策略 ===\n'));

    if (!resourceName) {
      console.log(chalk.red('❌ 请指定资源名称'));
      console.log(chalk.yellow('\n💡 使用方法:'));
      console.log(`  ${chalk.gray('$')} freelog-cli batch policy add <resourceName>\n`);
      return;
    }

    // 1. 验证登录
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载批量配置
    const spinner = ora('正在加载批量配置...').start();
    let batchConfig;
    try {
      batchConfig = await loadBatchResourceConfig(options.config);
      spinner.succeed('批量配置加载成功');
    } catch (err: unknown) {
      spinner.fail('加载批量配置失败');
      throw err;
    }

    // 3. 查找指定的资源
    const item = batchConfig.resources.find((r) => r.name === resourceName);
    
    if (!item) {
      console.log(chalk.red(`❌ 未找到资源: ${resourceName}`));
      console.log(chalk.blue('\n💡 可用资源列表:'));
      batchConfig.resources.forEach((r) => {
        console.log(`  - ${chalk.cyan(r.name)}`);
      });
      return;
    }

    if (item.skip) {
      console.log(chalk.yellow(`⚠️  资源 ${resourceName} 已标记为跳过`));
      return;
    }

    if (!item.resourceId) {
      console.log(chalk.yellow(`⚠️  资源 ${resourceName} 尚未创建，请先执行 batch create`));
      return;
    }

    // 4. 构建资源配置（用于策略添加）
    const resourceConfig = batchItemToResourceConfig(item, batchConfig.defaults);
    resourceConfig.resourceId = item.resourceId;

    // 5. 创建临时资源配置文件
    const batchConfigPath = getBatchResourceConfigPath(options.config);
    const batchConfigDir = path.dirname(batchConfigPath);
    const tempResourceConfigPath = path.join(batchConfigDir, `.temp.resource.config.${item.name}.js`);

    // 保存临时资源配置
    const resourceConfigContent = `const config = ${JSON.stringify(resourceConfig, null, 2)};\nmodule.exports = config;`;
    await fs.writeFile(tempResourceConfigPath, resourceConfigContent, 'utf-8');

    let tempResourceConfigPathCreated = true;

    try {
      // 6. 使用公共函数添加策略
      const configOps: PolicyConfigOperations<ResourceConfig> = {
        loadConfig: async () => {
          return await loadResourceConfig(tempResourceConfigPath);
        },
        saveConfig: async (config: ResourceConfig) => {
          await saveResourceConfig(config, tempResourceConfigPath);
          // 同时更新批量配置中的策略信息（如果需要）
          // 注意：这里只更新临时文件，批量配置本身不存储策略详情
        },
        calculatePolicyChanges: (localPolicies, remotePolicies) => {
          return calculatePolicyChanges(localPolicies, remotePolicies);
        },
        configToUpdateBody: (config, policyChanges) => {
          return resourceConfigToUpdateBody(config, policyChanges);
        },
        updatePolicyIdsFromResponse: (config, response: ResourceDetailResponse) => {
          if (response && response.policies && Array.isArray(response.policies)) {
            const policyIdMap = new Map(
              response.policies.map((p) => [p.policyName, p.policyId])
            );
            if (config.policies) {
              config.policies = config.policies.map((localPolicy) => {
                const serverPolicyId = policyIdMap.get(localPolicy.policyName);
                if (serverPolicyId && localPolicy.policyId !== serverPolicyId) {
                  return { ...localPolicy, policyId: serverPolicyId };
                }
                return localPolicy;
              });
            }
          }
          return config;
        },
        getResourceId: (config) => config.resourceId,
      };

      await addPolicy(options, configOps, 'batch');

      console.log(chalk.green('\n✔ ') + '策略添加成功');
      console.log(chalk.blue(`  资源: ${chalk.cyan(resourceName)}`));
      console.log(chalk.blue('\n💡 注意: 策略信息存储在资源配置中，批量配置主要用于管理资源列表'));

    } finally {
      // 清理临时配置文件
      if (tempResourceConfigPathCreated && fs.existsSync(tempResourceConfigPath)) {
        await fs.remove(tempResourceConfigPath);
      }
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '添加策略失败', options.debug);
  }
}
