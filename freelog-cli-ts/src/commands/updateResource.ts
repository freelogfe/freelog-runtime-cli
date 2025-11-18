/**
 * update 命令
 * 更新 Freelog 资源信息（intro, coverImages）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../types';
import { requireAuth } from '../core/auth';
import {
  loadResourceConfig,
  saveResourceConfig,
  calculatePolicyChanges,
  resourceConfigToUpdateBody,
  responseToResourceConfig,
} from '../services/resourceConfigService';
import { updateResource } from '../api/create';
import { getResourceInfo } from '../api/resourceGet';

/**
 * 执行 update 命令
 */
export async function executeUpdateResource(
  resource?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 更新 Freelog 资源信息 ===\n'));

    // 1. 验证登录
    requireAuth();

    // 2. 加载资源配置
    const spinner = ora('正在加载资源配置...').start();
    let resourceConfig;
    try {
      resourceConfig = await loadResourceConfig(options.config);
      spinner.succeed('资源配置加载成功');
    } catch (err: any) {
      spinner.fail('加载资源配置失败');
      throw err;
    }

    // 3. 确定要更新的资源（优先使用配置文件中的 resourceId）
    let resourceId = resourceConfig.resourceId || resource;
    if (!resourceId) {
      console.log(chalk.red('\n❌ 未指定资源 ID'));
      console.log(chalk.yellow('\n💡 请使用以下方式之一:'));
      console.log(chalk.cyan('  1. 在配置文件中设置 resourceId'));
      console.log(chalk.cyan('  2. 使用命令参数: freelog-cli update <resourceId>'));
      console.log(chalk.cyan('  3. 先执行: freelog-cli create 创建资源'));
      throw new Error('未指定资源 ID');
    }
    
    // 如果命令行提供了 resourceId，且与配置文件不一致，提示用户
    if (resource && resource !== resourceConfig.resourceId && resourceConfig.resourceId) {
      const { confirmUseCmdId } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmUseCmdId',
          message: `配置文件中的 resourceId (${resourceConfig.resourceId}) 与命令参数 (${resource}) 不一致，是否使用命令参数？`,
          default: false,
        },
      ]);
      
      if (confirmUseCmdId) {
        resourceId = resource;
        resourceConfig.resourceId = resource;
      }
    }

    // 4. 先获取服务器上的资源信息（用于比对 policies）
    const fetchSpinner = ora('正在获取资源信息...').start();
    let remoteResourceInfo;
    try {
      remoteResourceInfo = await getResourceInfo(resourceId, {
        isLoadLatestVersionInfo: 0, // 不加载版本信息
      });
      fetchSpinner.succeed('资源信息获取成功');
    } catch (err: any) {
      fetchSpinner.fail('获取资源信息失败');
      throw err;
    }

    // 5. 更新本地配置（使用服务器返回的最新信息，但保留用户要修改的字段）
    // 先同步服务器数据到本地配置
    const syncedConfig = responseToResourceConfig(remoteResourceInfo);
    // 保留本地配置中用户可能修改的字段
    resourceConfig.resourceId = syncedConfig.resourceId;
    resourceConfig.resourceName = syncedConfig.resourceName;
    resourceConfig.resourceType = syncedConfig.resourceType;
    resourceConfig.resourceTitle = syncedConfig.resourceTitle;
    resourceConfig.resourceTypeCode = syncedConfig.resourceTypeCode;
    resourceConfig.status = syncedConfig.status;
    // policies 从服务器同步，保留 policyId
    resourceConfig.policies = syncedConfig.policies;

    // 6. 获取要更新的字段（API 支持：status, intro, tags, coverImages）
    let statusToUpdate = options.status 
      ? parseInt(options.status as string, 10)
      : undefined;
    let introToUpdate = options.intro as string | undefined;
    let coverImagesToUpdate = options.cover 
      ? (options.cover as string).split(',').map(url => url.trim())
      : undefined;
    let tagsToUpdate = options.tags
      ? (options.tags as string).split(',').map(tag => tag.trim()).filter(tag => tag)
      : undefined;

    // 如果命令行没有提供，交互式输入
    if (statusToUpdate === undefined && !introToUpdate && !coverImagesToUpdate && !tagsToUpdate) {
      const { fields } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'fields',
          message: '选择要更新的字段:',
          choices: [
            { name: '资源状态 (status)', value: 'status' },
            { name: '资源介绍 (intro)', value: 'intro' },
            { name: '封面图 (coverImages)', value: 'coverImages' },
            { name: '标签 (tags)', value: 'tags' },
          ],
        },
      ]);

      if (fields.length === 0) {
        console.log(chalk.blue('ℹ️  未选择任何字段，操作取消'));
        return;
      }

      if (fields.includes('status')) {
        const { status } = await inquirer.prompt([
          {
            type: 'list',
            name: 'status',
            message: '请选择资源状态:',
            choices: [
              { name: '上线 (1)', value: 1 },
              { name: '下线 (4)', value: 4 },
            ],
            default: resourceConfig.status === 1 ? 1 : resourceConfig.status === 4 ? 4 : undefined,
          },
        ]);
        statusToUpdate = status;
      }

      if (fields.includes('intro')) {
        const { intro } = await inquirer.prompt([
          {
            type: 'input',
            name: 'intro',
            message: '请输入资源介绍:',
            default: resourceConfig.intro || '',
          },
        ]);
        introToUpdate = intro;
      }

      if (fields.includes('coverImages')) {
        const { coverImages } = await inquirer.prompt([
          {
            type: 'input',
            name: 'coverImages',
            message: '请输入封面图 URL（多个用逗号分隔）:',
            default: resourceConfig.coverImages?.join(', ') || '',
          },
        ]);
        coverImagesToUpdate = coverImages
          .split(',')
          .map((url: string) => url.trim())
          .filter((url: string) => url);
      }

      if (fields.includes('tags')) {
        const { tags } = await inquirer.prompt([
          {
            type: 'input',
            name: 'tags',
            message: '请输入标签（多个用逗号分隔）:',
            default: resourceConfig.tags?.join(', ') || '',
          },
        ]);
        tagsToUpdate = tags
          .split(',')
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag);
      }
    }

    // 7. 更新本地配置（只更新要提交的字段）
    if (statusToUpdate !== undefined) {
      resourceConfig.status = statusToUpdate;
    }
    if (introToUpdate !== undefined) {
      resourceConfig.intro = introToUpdate;
    }
    if (coverImagesToUpdate !== undefined) {
      resourceConfig.coverImages = coverImagesToUpdate;
    }
    if (tagsToUpdate !== undefined) {
      resourceConfig.tags = tagsToUpdate;
    }

    // 8. 计算策略差异（比对本地配置和服务器策略）
    const remotePolicies = remoteResourceInfo.policies || [];
    const policyChanges = calculatePolicyChanges(
      resourceConfig.policies,
      remotePolicies.map(p => ({
        policyId: p.policyId,
        policyName: p.policyName,
        status: p.status,
      }))
    );

    // 9. 构建更新请求体
    const updateBody = resourceConfigToUpdateBody(resourceConfig, policyChanges);

    // 10. 显示要更新的信息
    console.log(chalk.blue('\nℹ️  更新信息:'));
    console.log(`  资源 ID: ${chalk.cyan(resourceId)}`);
    if (statusToUpdate !== undefined) {
      console.log(`  新的状态: ${chalk.cyan(statusToUpdate === 1 ? '上线' : '下线')}`);
    }
    if (introToUpdate !== undefined) {
      console.log(`  新的介绍: ${chalk.cyan(introToUpdate || '(清空)')}`);
    }
    if (coverImagesToUpdate !== undefined) {
      console.log(`  新的封面图: ${chalk.cyan(coverImagesToUpdate.length)} 张`);
    }
    if (tagsToUpdate !== undefined) {
      console.log(`  新的标签: ${chalk.cyan(tagsToUpdate.join(', ') || '(清空)')}`);
    }
    if (policyChanges.addPolicies.length > 0) {
      console.log(`  新增策略: ${chalk.cyan(policyChanges.addPolicies.map(p => p.policyName).join(', '))}`);
    }
    if (policyChanges.updatePolicies.length > 0) {
      console.log(`  更新策略: ${chalk.cyan(policyChanges.updatePolicies.length)} 个`);
    }

    // 11. 确认更新
    const { confirmUpdate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmUpdate',
        message: '确认更新资源信息？',
        default: true,
      },
    ]);

    if (!confirmUpdate) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 12. 调用 API 更新资源
    const updateSpinner = ora('正在更新资源...').start();
    try {
      const result = await updateResource(resourceId, updateBody);

      updateSpinner.succeed('资源更新成功');

      // 13. 更新本地配置（保存所有字段，包括 policies）
      const updatedConfig = responseToResourceConfig(result);
      resourceConfig.resourceId = updatedConfig.resourceId;
      resourceConfig.resourceName = updatedConfig.resourceName;
      resourceConfig.resourceType = updatedConfig.resourceType;
      resourceConfig.resourceTitle = updatedConfig.resourceTitle;
      resourceConfig.intro = updatedConfig.intro;
      resourceConfig.coverImages = updatedConfig.coverImages;
      resourceConfig.tags = updatedConfig.tags;
      resourceConfig.resourceTypeCode = updatedConfig.resourceTypeCode;
      resourceConfig.status = updatedConfig.status;
      resourceConfig.policies = updatedConfig.policies; // 保存更新后的策略（包含 policyId）
      await saveResourceConfig(resourceConfig, options.config);

      // 10. 显示结果
      console.log(chalk.green('\n✔ ') + '资源信息更新完成');
      console.log(chalk.blue('ℹ️  资源 ID: ') + chalk.cyan(result.resourceId));
      if (statusToUpdate !== undefined) {
        console.log(chalk.blue('ℹ️  资源状态: ') + chalk.cyan(result.status === 1 ? '上线' : result.status === 4 ? '下线' : `状态${result.status}`));
      }
      if (introToUpdate !== undefined) {
        console.log(chalk.blue('ℹ️  资源介绍: ') + chalk.cyan(result.intro || '(空)'));
      }
      if (coverImagesToUpdate !== undefined) {
        console.log(chalk.blue('ℹ️  封面图数量: ') + chalk.cyan(result.coverImages.length.toString()));
      }
      if (tagsToUpdate !== undefined) {
        console.log(chalk.blue('ℹ️  标签: ') + chalk.cyan(result.tags.join(', ') || '(空)'));
      }
      
      console.log(chalk.green('✔ ') + '配置文件已更新');
      console.log(chalk.blue('ℹ️ ') + `配置文件: ${chalk.cyan('freelog.resource.config.*')}`);
      
      console.log(chalk.blue('\n💡 提示:'));
      console.log(`  ${chalk.gray('$')} freelog-cli sync ${chalk.gray('# 同步最新资源信息')}`);

    } catch (err: any) {
      updateSpinner.fail('更新资源失败');
      throw err;
    }

  } catch (err: any) {
    handleErrorAndExit(err, '更新资源失败', options.debug);
  }
}

