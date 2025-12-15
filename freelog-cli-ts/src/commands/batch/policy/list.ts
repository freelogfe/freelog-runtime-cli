/**
 * batch policy list 命令
 * 查看批量配置中某个资源的策略列表
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import Table from 'cli-table3';
import { CommandOptions } from '../../../types';
import { requireAuth } from '../../../core/auth';
import { confirmAuth } from '../../../utils/authConfirm';
import {
  loadBatchResourceConfig,
  saveBatchResourceConfig,
  updateBatchResourceItem,
  batchItemToResourceConfig,
} from '../../../services/batchResourceService';
import type { BatchResourceItemConfig } from '../../../../public/freelog.batch-resources';
import { getResourceInfo, updateResource } from '../../../api/resource';
import { handleErrorAndExit } from '../../../utils/errorHandler';
import {
  getPolicyChanges,
  buildPolicyUpdateBody,
  updatePolicyStatus,
  batchUpdatePolicyStatus,
  updateAllPolicyStatus,
} from '../../../services/policyService';
import { loadResourceConfig } from '../../../services/resourceConfigService';

/**
 * 执行 batch policy list 命令
 */
export async function executeBatchPolicyList(
  resourceName?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 批量查看策略列表 ===\n'));

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

    // 3. 选择要查看的资源
    let item: BatchResourceItemConfig | undefined;
    
    if (resourceName) {
      // 如果指定了资源名称
      item = batchConfig.resources.find((r) => r.name === resourceName);
      
      if (!item) {
        console.log(chalk.red(`❌ 未找到资源: ${resourceName}`));
        console.log(chalk.blue('\n💡 可用资源列表:'));
        batchConfig.resources.forEach((r) => {
          console.log(`  - ${chalk.cyan(r.name)}`);
        });
        return;
      }
    } else {
      // 交互式选择资源
      const availableResources = batchConfig.resources.filter(
        (item) => !item.skip && item.resourceId
      );
      
      if (availableResources.length === 0) {
        console.log(chalk.blue('ℹ️  没有已创建的资源'));
        return;
      }
      
      const { selectedResource } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedResource',
          message: '选择要查看策略的资源:',
          choices: availableResources.map((r) => ({
            name: `${r.name} (${r.resourceId})`,
            value: r.name,
          })),
        },
      ]);
      
      item = availableResources.find((r) => r.name === selectedResource);
    }

    if (!item || !item.resourceId) {
      console.log(chalk.blue('ℹ️  资源尚未创建'));
      return;
    }

    // 4. 获取资源的策略信息
    const fetchSpinner = ora(`正在获取 ${item.name} 的策略信息...`).start();
    
    let policies: Array<{ policyId: string; policyName: string; status: number }> = [];
    
    try {
      const resourceInfo = await getResourceInfo(item.resourceId, {
        isLoadLatestVersionInfo: 0,
      });

      policies = (resourceInfo.policies || []).map((policy) => ({
        policyId: policy.policyId || '',
        policyName: policy.policyName || '',
        status: policy.status || 0,
      }));

      fetchSpinner.succeed('策略信息获取完成');
    } catch (err: unknown) {
      fetchSpinner.fail(`获取策略信息失败: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }

    // 5. 显示策略列表
    console.log(chalk.blue(`\n📋 资源: ${chalk.cyan(item.name)} (${item.resourceId})\n`));
    
    if (policies.length === 0) {
      console.log(chalk.gray('  无策略\n'));
      console.log(chalk.blue('💡 提示: 使用 `freelog-cli policy add` 添加策略'));
      return;
    }

    const table = new Table({
      head: ['策略ID', '策略名称', '状态'],
      colWidths: [28, 30, 12],
    });

    policies.forEach((policy) => {
      const statusText = policy.status === 1 ? chalk.green('启用') : chalk.gray('停用');
      table.push([
        policy.policyId,
        policy.policyName,
        statusText,
      ]);
    });

    console.log(table.toString());
    console.log();

    // 6. 询问是否要更新策略状态
    const { updateStatus } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'updateStatus',
        message: '是否要更新策略状态（启用/停用）？',
        default: false,
      },
    ]);

    if (updateStatus) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: '选择操作:',
          choices: [
            { name: '启用所有策略', value: 'enable' },
            { name: '停用所有策略', value: 'disable' },
            { name: '选择策略单独更新', value: 'select' },
          ],
        },
      ]);

      if (action === 'select') {
        // 选择策略单独更新
        const { selectedPolicies } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selectedPolicies',
            message: '选择要更新的策略:',
            choices: policies.map((policy) => ({
              name: `${policy.policyName} (${policy.status === 1 ? '启用' : '停用'})`,
              value: policy.policyId,
            })),
          },
        ]);

        const { targetStatus } = await inquirer.prompt([
          {
            type: 'list',
            name: 'targetStatus',
            message: '选择目标状态:',
            choices: [
              { name: '启用', value: 1 },
              { name: '停用', value: 0 },
            ],
          },
        ]);

        const updateSpinner = ora('正在更新策略状态...').start();
        try {
          // 获取资源信息
          const resourceInfo = await getResourceInfo(item.resourceId, {
            isLoadLatestVersionInfo: 0,
          });

          // 更新策略状态
          const updatedPolicies = batchUpdatePolicyStatus(
            resourceInfo.policies || [],
            selectedPolicies,
            targetStatus
          );

          // 构建资源配置（用于策略更新）
          const resourceConfig = batchItemToResourceConfig(item, batchConfig.defaults);
          resourceConfig.resourceId = item.resourceId;
          resourceConfig.policies = updatedPolicies.map(p => ({
            policyName: p.policyName || '',
            policyText: p.policyText || '',
            status: p.status || 0,
            policyId: p.policyId,
          }));

          // 计算策略变更
          const policyChanges = getPolicyChanges(resourceConfig.policies, resourceInfo.policies || []);

          // 构建更新请求体
          const updateBody = buildPolicyUpdateBody(resourceConfig, policyChanges);

          // 更新资源
          await updateResource(item.resourceId, updateBody);
          updateSpinner.succeed(`成功更新 ${selectedPolicies.length} 个策略的状态`);
        } catch (err: unknown) {
          updateSpinner.fail('更新策略状态失败');
          throw err;
        }
      } else {
        // 批量更新所有策略
        const targetStatus = action === 'enable' ? 1 : 0;
        const updateSpinner = ora(`正在${action === 'enable' ? '启用' : '停用'}所有策略...`).start();

        try {
          // 获取资源信息
          const resourceInfo = await getResourceInfo(item.resourceId, {
            isLoadLatestVersionInfo: 0,
          });

          // 更新所有策略状态
          const updatedPolicies = updateAllPolicyStatus(
            resourceInfo.policies || [],
            targetStatus
          );

          // 构建资源配置（用于策略更新）
          const resourceConfig = batchItemToResourceConfig(item, batchConfig.defaults);
          resourceConfig.resourceId = item.resourceId;
          resourceConfig.policies = updatedPolicies.map(p => ({
            policyName: p.policyName || '',
            policyText: p.policyText || '',
            status: p.status || 0,
            policyId: p.policyId,
          }));

          // 计算策略变更
          const policyChanges = getPolicyChanges(resourceConfig.policies, resourceInfo.policies || []);

          // 构建更新请求体
          const updateBody = buildPolicyUpdateBody(resourceConfig, policyChanges);

          // 更新资源
          await updateResource(item.resourceId, updateBody);
          updateSpinner.succeed(`成功${action === 'enable' ? '启用' : '停用'}所有策略`);
        } catch (err: unknown) {
          updateSpinner.fail('更新策略状态失败');
          throw err;
        }
      }
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '批量查看策略失败', options.debug);
  }
}

