/**
 * update 命令
 * 更新 Freelog 资源信息（intro, coverImages）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../types';
import { requireAuth } from '../core/auth';
import { confirmAuth } from '../utils/authConfirm';
import {
  loadResourceConfig,
  saveResourceConfig,
  calculatePolicyChanges,
  resourceConfigToUpdateBody,
  responseToResourceConfig,
} from '../services/resourceConfigService';
import { updateResource, getResourceInfo, createResource } from '../api/resource';
import { handleErrorAndExit } from '../utils/errorHandler';
import { processCoverImage, validateCoverImageUrl } from '../utils/imageHelper';
import { resourceConfigToCreateBody } from '../services/resourceConfigService';

/**
 * 执行 update 命令
 */
export async function executeUpdateResource(
  resource?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    const isLocalOnly = options.localOnly === true;
    const shouldCreate = options.create === true;
    
    console.log(chalk.cyan('\n=== 更新 Freelog 资源信息 ===\n'));

    // 1. 如果不是只更新本地配置，需要验证登录
    // 如果只更新本地配置，但需要上传封面图，也需要登录
    if (!isLocalOnly || options.cover) {
      requireAuth();
      await confirmAuth(options.skipConfirm);
    }

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

    // 4. 如果不是只更新本地配置，需要获取服务器上的资源信息
    let remoteResourceInfo: any = null;
    if (!isLocalOnly) {
      // 如果没有 resourceId，且需要创建资源
      if (!resourceId) {
        if (shouldCreate) {
          console.log(chalk.yellow('\n⚠️  资源不存在，将创建新资源'));
          resourceId = ''; // 创建资源时不需要 resourceId
        } else {
          console.log(chalk.red('\n❌ 未指定资源 ID'));
          console.log(chalk.yellow('\n💡 请使用以下方式之一:'));
          console.log(chalk.cyan('  1. 在配置文件中设置 resourceId'));
          console.log(chalk.cyan('  2. 使用命令参数: freelog-cli update <resourceId>'));
          console.log(chalk.cyan('  3. 使用 --create 选项创建资源: freelog-cli update --create'));
          console.log(chalk.cyan('  4. 使用 --local-only 选项只更新配置文件: freelog-cli update --local-only'));
          throw new Error('未指定资源 ID');
        }
      } else {
        // 尝试获取资源信息
        const fetchSpinner = ora('正在获取资源信息...').start();
        try {
          remoteResourceInfo = await getResourceInfo(resourceId, {
            isLoadLatestVersionInfo: 0, // 不加载版本信息
          });
          fetchSpinner.succeed('资源信息获取成功');
          
          // 更新本地配置（使用服务器返回的最新信息，但保留用户要修改的字段）
          const syncedConfig = responseToResourceConfig(remoteResourceInfo);
          resourceConfig.resourceId = syncedConfig.resourceId;
          resourceConfig.resourceName = syncedConfig.resourceName;
          resourceConfig.resourceType = syncedConfig.resourceType;
          resourceConfig.resourceTitle = syncedConfig.resourceTitle;
          resourceConfig.resourceTypeCode = syncedConfig.resourceTypeCode;
          resourceConfig.status = syncedConfig.status;
          // policies 从服务器同步，保留 policyId
          resourceConfig.policies = syncedConfig.policies;
        } catch (err: any) {
          fetchSpinner.fail('获取资源信息失败');
          // 如果资源不存在且允许创建
          if (shouldCreate || err.message?.includes('不存在') || err.message?.includes('404')) {
            console.log(chalk.yellow('\n⚠️  资源不存在，将创建新资源'));
            remoteResourceInfo = null;
            resourceId = ''; // 创建资源时不需要 resourceId
          } else {
            throw err;
          }
        }
      }
    }

    // 6. 获取要更新的字段（API 支持：status, intro, tags, coverImages）
    let statusToUpdate = options.status 
      ? parseInt(options.status as string, 10)
      : undefined;
    let introToUpdate = options.intro as string | undefined;
    
    // 验证简介长度
    if (introToUpdate && introToUpdate.length > 200) {
      console.log(chalk.red(`\n❌ 资源介绍不能超过200个字符，当前为 ${introToUpdate.length} 个字符`));
      throw new Error('资源介绍长度验证失败');
    }
    
    // 封面图实际只能有一张，取第一个
    // 如果命令行提供了封面图，需要处理（可能是本地路径或URL）
    let coverImageToUpdate = options.cover 
      ? (options.cover as string).split(',')[0].trim()
      : undefined;
    
    // 如果命令行提供了封面图，处理本地路径上传
    // 如果只更新本地配置，封面图必须是已上传的URL
    if (coverImageToUpdate) {
      if (isLocalOnly) {
        // 只更新本地配置时，验证封面图URL
        const validation = validateCoverImageUrl(coverImageToUpdate);
        if (!validation.valid) {
          console.log(chalk.red(`\n❌ ${validation.error}`));
          console.log(chalk.yellow('💡 提示: 使用 --local-only 选项时，封面图必须是已上传的URL'));
          throw new Error('封面图URL验证失败');
        }
      } else {
        // 需要同步到服务器时，可以上传本地文件
        const uploadSpinner = ora('正在处理封面图...').start();
        try {
          coverImageToUpdate = await processCoverImage(coverImageToUpdate);
          uploadSpinner.succeed(`封面图处理成功: ${coverImageToUpdate}`);
        } catch (err: any) {
          uploadSpinner.fail('封面图处理失败');
          throw err;
        }
      }
    }
    
    // 处理标签：去除重复并提示，验证单个标签长度
    let tagsToUpdate: string[] | undefined = options.tags
      ? (options.tags as string).split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag)
      : undefined;
    
    if (tagsToUpdate && tagsToUpdate.length > 0) {
      // 检查单个标签长度
      const invalidTags = tagsToUpdate.filter((tag: string) => tag.length > 20);
      if (invalidTags.length > 0) {
        console.log(chalk.red(`\n❌ 以下标签超过20个字符限制:`));
        invalidTags.forEach((tag: string) => {
          console.log(chalk.red(`  - ${tag} (${tag.length} 个字符)`));
        });
        throw new Error('标签长度验证失败，单个标签不能超过20个字符');
      }
      
      const uniqueTags = Array.from(new Set(tagsToUpdate));
      if (uniqueTags.length < tagsToUpdate.length) {
        const duplicates = tagsToUpdate.filter((tag: string, index: number) => tagsToUpdate!.indexOf(tag) !== index);
        console.log(chalk.yellow(`\n⚠️  发现重复标签: ${Array.from(new Set(duplicates)).join(', ')}`));
        const { confirmDeduplicate } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmDeduplicate',
            message: `是否去重后继续？（去重后标签: ${uniqueTags.join(', ')})`,
            default: true,
          },
        ]);
        if (confirmDeduplicate) {
          tagsToUpdate = uniqueTags;
          console.log(chalk.green(`✔ 已去重，标签: ${tagsToUpdate.join(', ')}`));
        } else {
          console.log(chalk.blue('ℹ️  操作已取消'));
          return;
        }
      }
    }

    // 如果命令行没有提供，交互式输入
    if (statusToUpdate === undefined && !introToUpdate && !coverImageToUpdate && !tagsToUpdate) {
      const { fields } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'fields',
          message: '选择要更新的字段:',
          instructions: '使用空格键选择/取消，按 a 全选/取消全选，按 i 反选，回车确认',
          choices: [
            { name: '资源状态 (status)', value: 'status' },
            { name: '资源介绍 (intro)', value: 'intro' },
            { name: '封面图 (coverImage)', value: 'coverImage' },
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
            { name: '上架 (1)', value: 1 },
            { name: '下架 (4)', value: 4 },
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
            message: '请输入资源介绍（最多200个字符）:',
            default: resourceConfig.intro || '',
            validate: (input: string) => {
              if (input.length > 200) {
                return `资源介绍不能超过200个字符，当前为 ${input.length} 个字符`;
              }
              return true;
            },
          },
        ]);
        introToUpdate = intro;
      }

      if (fields.includes('coverImage')) {
        const coverImageMessage = isLocalOnly 
          ? '请输入封面图 URL（已上传的图片URL，仅更新本地配置）:'
          : '请输入封面图 URL 或本地文件路径（本地文件会自动上传）:';
        
        const { coverImage } = await inquirer.prompt([
          {
            type: 'input',
            name: 'coverImage',
            message: coverImageMessage,
            default: resourceConfig.coverImages?.[0] || '',
            validate: (input: string) => {
              const trimmed = input.trim();
              if (!trimmed) {
                return true; // 允许为空（清空封面图）
              }
              if (isLocalOnly) {
                // 只更新本地配置时，必须是已上传的URL
                const validation = validateCoverImageUrl(trimmed);
                if (!validation.valid) {
                  return validation.error + '（仅更新本地配置时，封面图必须是已上传的URL）';
                }
              }
              return true;
            },
          },
        ]);
        coverImageToUpdate = coverImage.trim() || undefined;
        
        // 如果不是只更新本地配置，处理本地文件上传
        if (coverImageToUpdate && !isLocalOnly) {
          const uploadSpinner = ora('正在处理封面图...').start();
          try {
            coverImageToUpdate = await processCoverImage(coverImageToUpdate);
            uploadSpinner.succeed(`封面图处理成功: ${coverImageToUpdate}`);
          } catch (err: any) {
            uploadSpinner.fail('封面图处理失败');
            throw err;
          }
        }
      }

      if (fields.includes('tags')) {
        const { tags } = await inquirer.prompt([
          {
            type: 'input',
            name: 'tags',
            message: '请输入标签（多个用逗号分隔，单个标签最多20个字符）:',
            default: resourceConfig.tags?.join(', ') || '',
            validate: (input: string) => {
              const inputTags = input
                .split(',')
                .map((tag: string) => tag.trim())
                .filter((tag: string) => tag);
              
              // 检查单个标签长度
              const invalidTags = inputTags.filter((tag: string) => tag.length > 20);
              if (invalidTags.length > 0) {
                return `以下标签超过20个字符限制: ${invalidTags.join(', ')}`;
              }
              
              return true;
            },
          },
        ]);
        const inputTags: string[] = tags
          .split(',')
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag);
        
        // 检查并处理重复标签
        if (inputTags.length > 0) {
          const uniqueTags: string[] = Array.from(new Set(inputTags));
          if (uniqueTags.length < inputTags.length) {
            const duplicates = inputTags.filter((tag: string, index: number) => inputTags.indexOf(tag) !== index);
            console.log(chalk.yellow(`\n⚠️  发现重复标签: ${Array.from(new Set(duplicates)).join(', ')}`));
            const { confirmDeduplicate } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'confirmDeduplicate',
                message: `是否去重后继续？（去重后标签: ${uniqueTags.join(', ')})`,
                default: true,
              },
            ]);
            if (confirmDeduplicate) {
              tagsToUpdate = uniqueTags;
              console.log(chalk.green(`✔ 已去重，标签: ${tagsToUpdate.join(', ')}`));
            } else {
              console.log(chalk.blue('ℹ️  操作已取消'));
              return;
            }
          } else {
            tagsToUpdate = inputTags;
          }
        } else {
          tagsToUpdate = inputTags;
        }
      }
    }

    // 7. 更新本地配置（只更新要提交的字段）
    if (statusToUpdate !== undefined) {
      resourceConfig.status = statusToUpdate;
    }
    if (introToUpdate !== undefined) {
      resourceConfig.intro = introToUpdate;
    }
    if (coverImageToUpdate !== undefined) {
      // 封面图实际只能有一张，保存为数组格式（只包含一个元素）
      resourceConfig.coverImages = coverImageToUpdate ? [coverImageToUpdate] : [];
    }
    if (tagsToUpdate !== undefined) {
      resourceConfig.tags = tagsToUpdate;
    }

    // 8. 检查是否有要更新的字段
    const hasUpdates = statusToUpdate !== undefined || 
                       introToUpdate !== undefined || 
                       coverImageToUpdate !== undefined || 
                       tagsToUpdate !== undefined;
    
    if (!hasUpdates) {
      console.log(chalk.yellow('\n⚠️  没有要更新的字段'));
      console.log(chalk.blue('💡 提示: 使用以下选项更新字段:'));
      console.log(chalk.cyan('  --intro <text>       更新资源介绍'));
      console.log(chalk.cyan('  --cover <path>       更新封面图'));
      console.log(chalk.cyan('  --tags <tags>       更新标签'));
      console.log(chalk.cyan('  --status <status>    更新资源状态'));
      return;
    }

    // 9. 显示要更新的信息
    console.log(chalk.blue('\nℹ️  更新信息:'));
    if (resourceId) {
      console.log(`  资源 ID: ${chalk.cyan(resourceId)}`);
    } else {
      console.log(`  资源 ID: ${chalk.yellow('(将创建新资源)')}`);
    }
    if (statusToUpdate !== undefined) {
      console.log(`  新的状态: ${chalk.cyan(statusToUpdate === 1 ? '上架' : '下架')}`);
    }
    if (introToUpdate !== undefined) {
      console.log(`  新的介绍: ${chalk.cyan(introToUpdate || '(清空)')}`);
    }
    if (coverImageToUpdate !== undefined) {
      console.log(`  新的封面图: ${chalk.cyan(coverImageToUpdate || '(清空)')}`);
    }
    if (tagsToUpdate !== undefined) {
      console.log(`  新的标签: ${chalk.cyan(tagsToUpdate.join(', ') || '(清空)')}`);
    }

    // 10. 如果只更新本地配置，直接保存并返回
    if (isLocalOnly) {
      await saveResourceConfig(resourceConfig, options.config);
      console.log(chalk.green('\n✔ ') + '配置文件已更新（仅本地）');
      console.log(chalk.blue('ℹ️ ') + `配置文件: ${chalk.cyan('freelog.resource.config.*')}`);
      console.log(chalk.yellow('\n⚠️  注意: 资源信息未同步到服务器'));
      return;
    }

    // 11. 计算策略差异（比对本地配置和服务器策略）
    const remotePolicies = remoteResourceInfo?.policies || [];
    const policyChanges = calculatePolicyChanges(
      resourceConfig.policies,
      remotePolicies.map((p: any) => ({
        policyId: p.policyId,
        policyName: p.policyName,
        status: p.status,
      }))
    );

    if (policyChanges.addPolicies.length > 0) {
      console.log(`  新增策略: ${chalk.cyan(policyChanges.addPolicies.map(p => p.policyName).join(', '))}`);
    }
    if (policyChanges.updatePolicies.length > 0) {
      console.log(`  更新策略: ${chalk.cyan(policyChanges.updatePolicies.length)} 个`);
    }

    // 12. 确认操作
    const actionMessage = !resourceId || !remoteResourceInfo 
      ? '确认创建资源？' 
      : '确认更新资源信息？';
    const { confirmUpdate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmUpdate',
        message: actionMessage,
        default: true,
      },
    ]);

    if (!confirmUpdate) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 13. 调用 API 创建或更新资源
    let result: any;
    if (!resourceId || !remoteResourceInfo) {
      // 创建资源
      const createSpinner = ora('正在创建资源...').start();
      try {
        // 检查必填字段
        if (!resourceConfig.resourceName) {
          throw new Error('资源名称 (resourceName) 不能为空');
        }
        if (!resourceConfig.resourceTypeCode) {
          throw new Error('资源类型代码 (resourceTypeCode) 不能为空');
        }
        if (!resourceConfig.resourceType || resourceConfig.resourceType.length === 0) {
          throw new Error('资源类型 (resourceType) 不能为空');
        }

        const createBody = resourceConfigToCreateBody(resourceConfig);
        result = await createResource(createBody);
        createSpinner.succeed('资源创建成功');
      } catch (err: any) {
        createSpinner.fail('创建资源失败');
        throw err;
      }
    } else {
      // 更新资源
      const updateSpinner = ora('正在更新资源...').start();
      try {
        const updateBody = resourceConfigToUpdateBody(resourceConfig, policyChanges);
        result = await updateResource(resourceId, updateBody);
        updateSpinner.succeed('资源更新成功');
      } catch (err: any) {
        updateSpinner.fail('更新资源失败');
        throw err;
      }
    }

    // 14. 更新本地配置（保存所有字段，包括 policies）
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

    // 15. 显示结果
    console.log(chalk.green('\n✔ ') + '资源信息更新完成');
    console.log(chalk.blue('ℹ️  资源 ID: ') + chalk.cyan(result.resourceId));
    if (statusToUpdate !== undefined) {
      console.log(chalk.blue('ℹ️  资源状态: ') + chalk.cyan(result.status === 1 ? '上架' : result.status === 4 ? '下架' : `状态${result.status}`));
    }
    if (introToUpdate !== undefined) {
      console.log(chalk.blue('ℹ️  资源介绍: ') + chalk.cyan(result.intro || '(空)'));
    }
    if (coverImageToUpdate !== undefined) {
      console.log(chalk.blue('ℹ️  封面图: ') + chalk.cyan(result.coverImages?.[0] || '(空)'));
    }
    if (tagsToUpdate !== undefined) {
      console.log(chalk.blue('ℹ️  标签: ') + chalk.cyan(result.tags.join(', ') || '(空)'));
    }
    
    console.log(chalk.green('✔ ') + '配置文件已更新');
    console.log(chalk.blue('ℹ️ ') + `配置文件: ${chalk.cyan('freelog.resource.config.*')}`);
    
    console.log(chalk.blue('\n💡 提示:'));
    console.log(`  ${chalk.gray('$')} freelog-cli syncr ${chalk.gray('# 同步最新资源信息')}`);

  } catch (err: any) {
    handleErrorAndExit(err, '更新资源失败', options.debug);
  }
}

