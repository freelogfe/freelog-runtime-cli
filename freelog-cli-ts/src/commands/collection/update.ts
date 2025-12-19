/**
 * collection update 命令
 * 更新 Freelog 合集资源信息（intro、coverImages、tags、status、catalogueProperty）
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
  responseToCollectionConfig,
} from '../../services/collectionConfigService';
import { updateResource, getResourceInfo } from '../../api/resource';
import { updateCollectionResource } from '../../api/collection';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 collection update 命令
 */
export async function executeCollectionUpdate(
  resource?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 更新 Freelog 合集资源信息 ===\n'));

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

    // 3. 确定要更新的资源（优先使用配置文件中的 resourceId）
    let resourceId = collectionConfig.resourceId || resource;
    if (!resourceId) {
      console.log(chalk.red('\n❌ 未指定资源 ID'));
      console.log(chalk.yellow('\n💡 请使用以下方式之一:'));
      console.log(chalk.cyan('  1. 在配置文件中设置 resourceId'));
      console.log(chalk.cyan('  2. 使用命令参数: freelog-cli2 collection update <resourceId>'));
      console.log(chalk.cyan('  3. 先执行: freelog-cli2 collection create 创建合集'));
      throw new Error('未指定资源 ID');
    }
    
    // 如果命令行提供了 resourceId，且与配置文件不一致，提示用户
    if (resource && resource !== collectionConfig.resourceId && collectionConfig.resourceId) {
      const { confirmUseCmdId } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmUseCmdId',
          message: `配置文件中的 resourceId (${collectionConfig.resourceId}) 与命令参数 (${resource}) 不一致，是否使用命令参数？`,
          default: false,
        },
      ]);
      
      if (confirmUseCmdId) {
        resourceId = resource;
        collectionConfig.resourceId = resource;
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
    const syncedConfig = responseToCollectionConfig(remoteResourceInfo);
    collectionConfig.resourceId = syncedConfig.resourceId;
    collectionConfig.resourceName = syncedConfig.resourceName;
    collectionConfig.resourceType = syncedConfig.resourceType;
    collectionConfig.resourceTitle = syncedConfig.resourceTitle;
    collectionConfig.resourceTypeCode = syncedConfig.resourceTypeCode;
    collectionConfig.status = syncedConfig.status;
    collectionConfig.policies = syncedConfig.policies;
    // 保留 catalogueProperty（如果配置中有）
    if (collectionConfig.catalogueProperty) {
      syncedConfig.catalogueProperty = collectionConfig.catalogueProperty;
    }

    // 6. 获取要更新的字段（API 支持：status, intro, tags, coverImages, catalogueProperty）
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
          instructions: '使用空格键选择/取消，按 a 全选/取消全选，按 i 反选，回车确认',
          choices: [
            { name: '资源状态 (status)', value: 'status' },
            { name: '资源介绍 (intro)', value: 'intro' },
            { name: '封面图 (coverImages)', value: 'coverImages' },
            { name: '标签 (tags)', value: 'tags' },
            { name: '合集属性 (catalogueProperty)', value: 'catalogueProperty' },
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
            default: collectionConfig.status === 1 ? 1 : collectionConfig.status === 4 ? 4 : undefined,
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
            default: collectionConfig.intro || '',
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
            default: collectionConfig.coverImages?.join(', ') || '',
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
            default: collectionConfig.tags?.join(', ') || '',
          },
        ]);
        tagsToUpdate = tags
          .split(',')
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag);
      }

      if (fields.includes('catalogueProperty')) {
        const { collection_item_no_display } = await inquirer.prompt([
          {
            type: 'list',
            name: 'collection_item_no_display',
            message: '是否显示单品编号:',
            choices: [
              { name: '显示', value: 'collection_item_no_display_show' },
              { name: '隐藏', value: 'collection_item_no_display_hide' },
            ],
            default: collectionConfig.catalogueProperty?.collection_item_no_display || 'collection_item_no_display_show',
          },
        ]);

        const { collection_item_image_display } = await inquirer.prompt([
          {
            type: 'list',
            name: 'collection_item_image_display',
            message: '是否显示单品图片:',
            choices: [
              { name: '显示', value: 'collection_item_image_display_show' },
              { name: '隐藏', value: 'collection_item_image_display_hide' },
            ],
            default: collectionConfig.catalogueProperty?.collection_item_image_display || 'collection_item_image_display_show',
          },
        ]);

        const { collection_item_descr_display } = await inquirer.prompt([
          {
            type: 'list',
            name: 'collection_item_descr_display',
            message: '是否显示单品描述:',
            choices: [
              { name: '显示', value: 'collection_item_descr_display_show' },
              { name: '隐藏', value: 'collection_item_descr_display_hide' },
            ],
            default: collectionConfig.catalogueProperty?.collection_item_descr_display || 'collection_item_descr_display_show',
          },
        ]);

        const { collection_view } = await inquirer.prompt([
          {
            type: 'list',
            name: 'collection_view',
            message: '合集视图类型:',
            choices: [
              { name: '列表', value: 'collection_view_list' },
              { name: '卡片', value: 'collection_view_card' },
            ],
            default: collectionConfig.catalogueProperty?.collection_view || 'collection_view_list',
          },
        ]);

        collectionConfig.catalogueProperty = {
          collection_item_no_display,
          collection_item_image_display,
          collection_item_descr_display,
          collection_view,
        };
      }
    }

    // 7. 更新本地配置（只更新要提交的字段）
    if (statusToUpdate !== undefined) {
      collectionConfig.status = statusToUpdate;
    }
    if (introToUpdate !== undefined) {
      collectionConfig.intro = introToUpdate;
    }
    if (coverImagesToUpdate !== undefined) {
      collectionConfig.coverImages = coverImagesToUpdate;
    }
    if (tagsToUpdate !== undefined) {
      collectionConfig.tags = tagsToUpdate;
    }

    // 8. 计算策略差异（比对本地配置和服务器策略）
    const remotePolicies = remoteResourceInfo.policies || [];
    const policyChanges = calculatePolicyChanges(
      collectionConfig.policies,
      remotePolicies.map(p => ({
        policyId: p.policyId,
        policyName: p.policyName,
        status: p.status,
      }))
    );

    // 9. 构建更新请求体
    // 对于合集资源，需要同时更新普通资源信息和合集特有属性
    const updateBody = collectionConfigToUpdateBody(collectionConfig, policyChanges);
    
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
    if (collectionConfig.catalogueProperty) {
      console.log(`  合集属性: ${chalk.cyan('已更新')}`);
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
        message: '确认更新合集资源信息？',
        default: true,
      },
    ]);

    if (!confirmUpdate) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 12. 调用 API 更新资源
    const updateSpinner = ora('正在更新合集资源...').start();
    try {
      // 先更新普通资源信息
      const result = await updateResource(resourceId, updateBody);
      
      // 如果有合集属性需要更新，调用合集更新接口
      if (collectionConfig.catalogueProperty) {
        await updateCollectionResource(resourceId, {
          catalogueProperty: collectionConfig.catalogueProperty,
        });
      }

      updateSpinner.succeed('合集资源更新成功');

      // 13. 更新本地配置（保存所有字段，包括 policies）
      const updatedConfig = responseToCollectionConfig(result);
      collectionConfig.resourceId = updatedConfig.resourceId;
      collectionConfig.resourceName = updatedConfig.resourceName;
      collectionConfig.resourceType = updatedConfig.resourceType;
      collectionConfig.resourceTitle = updatedConfig.resourceTitle;
      collectionConfig.intro = updatedConfig.intro;
      collectionConfig.coverImages = updatedConfig.coverImages;
      collectionConfig.tags = updatedConfig.tags;
      collectionConfig.resourceTypeCode = updatedConfig.resourceTypeCode;
      collectionConfig.status = updatedConfig.status;
      collectionConfig.policies = updatedConfig.policies;
      await saveCollectionConfig(collectionConfig, options.config);

      // 14. 显示结果
      console.log(chalk.green('\n✔ ') + '合集资源信息更新完成');
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
      console.log(chalk.blue('ℹ️ ') + `配置文件: ${chalk.cyan('freelog.collection.config.*')}`);
      
      console.log(chalk.blue('\n💡 提示:'));
      console.log(`  ${chalk.gray('$')} freelog-cli2 collection item add <resourceId>  ${chalk.gray('# 添加单品')}`);

    } catch (err: any) {
      updateSpinner.fail('更新合集资源失败');
      throw err;
    }

  } catch (err: any) {
    handleErrorAndExit(err, '更新合集资源失败', options.debug);
  }
}

