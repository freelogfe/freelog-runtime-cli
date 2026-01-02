/**
 * collection policy 命令
 * 为合集添加和管理授权策略（复用资源的策略逻辑，但使用合集配置）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import {
  loadCollectionConfig,
  saveCollectionConfig,
  calculatePolicyChanges,
  collectionConfigToUpdateBody,
} from '../../services/collectionConfigService';
import {
  addPolicy,
  type PolicyConfigOperations,
} from '../../services/policyService';
import { updateResource, getResourceInfo } from '../../api/resource';
import { handleErrorAndExit } from '../../utils/errorHandler';
import type { CollectionConfig } from '../../../public/freelog.collection';
import type { ResourceDetailResponse } from '../../api/types';

/**
 * 执行 collection policy add 命令
 */
export async function executeCollectionPolicyAdd(options: CommandOptions = {}): Promise<void> {
  requireAuth();
  await confirmAuth(options.skipConfirm);

  const configOps: PolicyConfigOperations<CollectionConfig> = {
    loadConfig: loadCollectionConfig,
    saveConfig: saveCollectionConfig,
    calculatePolicyChanges: (localPolicies, remotePolicies) => {
      return calculatePolicyChanges(localPolicies as any, remotePolicies);
    },
    configToUpdateBody: (config, policyChanges) => {
      return collectionConfigToUpdateBody(config, policyChanges);
    },
    updatePolicyIdsFromResponse: (config, response: ResourceDetailResponse) => {
      if (response && response.policies && Array.isArray(response.policies)) {
        config.policies = config.policies?.map(localPolicy => {
          const matchingRemotePolicy = response.policies?.find((rp: any) => rp.policyName === localPolicy.policyName);
          if (matchingRemotePolicy && matchingRemotePolicy.policyId) {
            return { ...localPolicy, policyId: matchingRemotePolicy.policyId };
          }
          return localPolicy;
        }) || [];
      }
      return config;
    },
    getResourceId: (config) => config.resourceId,
  };

  await addPolicy(options, configOps, 'collection');
}

/**
 * 执行 collection policy list 命令
 * 列出合集配置中的策略，并允许启用/停用
 */
export async function executeCollectionPolicyList(options: CommandOptions = {}): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 策略列表管理 ===\n'));

    // 1. 验证登录并确认用户信息
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载合集配置
    const spinner = ora('正在加载合集配置...').start();
    let collectionConfig;
    try {
      collectionConfig = await loadCollectionConfig(options.config);
      spinner.succeed('合集配置加载成功');
    } catch (err: any) {
      spinner.fail('加载合集配置失败');
      throw err;
    }

    // 3. 检查是否有策略
    if (!collectionConfig.policies || collectionConfig.policies.length === 0) {
      console.log(chalk.yellow('⚠️  配置文件中没有策略'));
      console.log(chalk.gray('使用 `freelog-cli2 collection policy add` 添加策略'));
      return;
    }

    // 4. 显示策略列表
    console.log(chalk.cyan(`\n找到 ${collectionConfig.policies.length} 个策略:\n`));
    
    const policyChoices = collectionConfig.policies.map((policy, index) => {
      const statusText = policy.status === 1 
        ? chalk.green('✓ 启用') 
        : policy.status === 0 
        ? chalk.red('✗ 停用')
        : chalk.gray('未知');
      
      // 通过是否有 policyId 区分新增和已有策略
      const policyTypeText = policy.policyId 
        ? chalk.blue('[已同步]')
        : chalk.yellow('[新增]');
      
      return {
        name: `${index + 1}. ${policy.policyName} ${policyTypeText} ${statusText}`,
        value: index,
        short: policy.policyName,
      };
    });

    policyChoices.push({
      name: '完成',
      value: -1,
      short: '完成',
    });

    // 5. 循环选择策略进行管理
    while (true) {
      const { selectedIndex } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedIndex',
          message: '请选择要管理的策略:',
          choices: policyChoices,
        },
      ]);

      if (selectedIndex === -1) {
        break;
      }

      const selectedPolicy = collectionConfig.policies[selectedIndex];
      const currentStatus = selectedPolicy.status === 1 ? '启用' : '停用';
      const newStatus = selectedPolicy.status === 1 ? 0 : 1;
      const newStatusText = newStatus === 1 ? '启用' : '停用';
      const policyTypeText = selectedPolicy.policyId ? '（已同步到服务器）' : '（新增，未同步）';

      // 6. 确认修改状态
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `确认将策略 "${selectedPolicy.policyName}"${policyTypeText} 从 ${currentStatus} 改为 ${newStatusText}?`,
          default: true,
        },
      ]);

      if (!confirm) {
        console.log(chalk.blue('ℹ️  操作已取消'));
        continue;
      }

      // 7. 更新策略状态
      selectedPolicy.status = newStatus;

      // 8. 保存配置文件
      const saveSpinner = ora('正在保存配置文件...').start();
      try {
        await saveCollectionConfig(collectionConfig, options.config);
        saveSpinner.succeed('配置文件保存成功');
      } catch (err: any) {
        saveSpinner.fail('保存配置文件失败');
        throw err;
      }

      console.log(chalk.green(`\n✅ 策略 "${selectedPolicy.policyName}" 已${newStatusText}`));

      // 9. 询问是否立即更新到服务器
      if (!collectionConfig.resourceId) {
        console.log(chalk.yellow('\n⚠️  合集配置中未设置 resourceId，无法更新到服务器'));
        continue;
      }

      const { updateNow } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'updateNow',
          message: '是否立即更新策略状态到服务器?',
          default: true,
        },
      ]);

      if (!updateNow) {
        continue;
      }

      // 10. 获取服务器上的资源信息
      const fetchSpinner = ora('正在获取资源信息...').start();
      let remoteResourceInfo;
      try {
        remoteResourceInfo = await getResourceInfo(collectionConfig.resourceId, {
          isLoadLatestVersionInfo: 0,
        });
        fetchSpinner.succeed('资源信息获取成功');
      } catch (err: any) {
        fetchSpinner.fail('获取资源信息失败');
        console.log(chalk.yellow(`⚠️  无法更新到服务器: ${err.message}`));
        continue;
      }

      // 11. 计算策略差异
      const remotePolicies = remoteResourceInfo.policies || [];
      const policyChanges = calculatePolicyChanges(
        collectionConfig.policies as any,
        remotePolicies.map((p) => ({
          policyId: p.policyId,
          policyName: p.policyName,
          status: p.status,
        }))
      );

      // 12. 构建更新请求体（只包含策略状态更新）
      const updateBody: {
        updatePolicies?: Array<{ policyId: string; status: number }>;
      } = {};
      
      if (policyChanges.updatePolicies && policyChanges.updatePolicies.length > 0) {
        updateBody.updatePolicies = policyChanges.updatePolicies;
      }

      // 13. 更新资源
      if (updateBody.updatePolicies && updateBody.updatePolicies.length > 0) {
        const updateSpinner = ora('正在更新资源策略状态...').start();
        try {
          const updatedResource = await updateResource(collectionConfig.resourceId, updateBody);
          updateSpinner.succeed('资源策略状态更新成功');

          // 14. 同步策略ID到配置文件（如果策略还没有 policyId）
          if (updatedResource.policies && updatedResource.policies.length > 0) {
            const policyIdMap = new Map(
              updatedResource.policies.map((p) => [p.policyName, p.policyId])
            );

            // 更新本地配置中的 policyId
            let hasUpdates = false;
            for (const localPolicy of collectionConfig.policies) {
              const serverPolicyId = policyIdMap.get(localPolicy.policyName);
              if (serverPolicyId && !localPolicy.policyId) {
                localPolicy.policyId = serverPolicyId;
                hasUpdates = true;
              }
            }

            if (hasUpdates) {
              await saveCollectionConfig(collectionConfig, options.config);
              console.log(chalk.green('✅ 策略ID已同步到配置文件'));
            }
          }
        } catch (err: any) {
          updateSpinner.fail('更新资源策略状态失败');
          console.log(chalk.yellow(`⚠️  更新失败: ${err.message}`));
        }
      } else {
        console.log(chalk.yellow('⚠️  没有需要更新的策略状态'));
      }
    }

    console.log(chalk.green('\n✅ 策略管理完成！'));
  } catch (error) {
    handleErrorAndExit(error);
  }
}
