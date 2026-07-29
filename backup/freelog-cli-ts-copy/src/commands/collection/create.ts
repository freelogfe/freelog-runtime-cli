/**
 * collection create 命令
 * 创建 Freelog 合集资源
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import {
  loadCollectionConfig,
  saveCollectionConfig,
  collectionConfigToCreateBody,
  responseToCollectionConfig,
} from '../../services/collectionConfigService';
import { createResource, type CreateResourceBody } from '../../api/resource';
import { handleErrorAndExit } from '../../utils/errorHandler';
import { confirmAuth } from '../../utils/authConfirm';

/**
 * 执行 collection create 命令
 */
export async function executeCollectionCreate(
  name?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 创建 Freelog 合集资源 ===\n'));

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

    // 3. 检查 resourceId 是否已存在
    if (collectionConfig.resourceId) {
      const { confirmOverwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmOverwrite',
          message: `合集配置中已有 resourceId: ${collectionConfig.resourceId}，是否继续创建新合集？`,
          default: false,
        },
      ]);

      if (!confirmOverwrite) {
        console.log(chalk.blue('ℹ️  操作已取消'));
        return;
      }
    }

    // 4. 如果提供了 name 参数，更新 resourceName
    if (name) {
      collectionConfig.resourceName = name;
    }

    // 5. 交互式输入缺失的必填字段
    if (!collectionConfig.resourceName) {
      const { resourceName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'resourceName',
          message: '请输入合集名称:',
          validate: (input: string) => (input.trim() ? true : '合集名称不能为空'),
        },
      ]);
      collectionConfig.resourceName = resourceName;
    }

    // 检查 resourceTypeCode 或 resourceType
    if (!collectionConfig.resourceTypeCode && (!collectionConfig.resourceType || collectionConfig.resourceType.length === 0)) {
      const { resourceTypeCode } = await inquirer.prompt([
        {
          type: 'input',
          name: 'resourceTypeCode',
          message: '请输入合集资源类型代码:',
          validate: (input: string) => (input.trim() ? true : '资源类型代码不能为空'),
        },
      ]);
      collectionConfig.resourceTypeCode = resourceTypeCode.trim();
      // 同时设置 resourceType 数组（用于显示）
      if (!collectionConfig.resourceType) {
        collectionConfig.resourceType = [resourceTypeCode.trim()];
      }
    } else if (!collectionConfig.resourceTypeCode && collectionConfig.resourceType && collectionConfig.resourceType.length > 0) {
      // 如果只有 resourceType 数组，使用第一个作为 resourceTypeCode
      collectionConfig.resourceTypeCode = collectionConfig.resourceType[0];
    }

    // 6. 显示要创建的合集信息
    console.log(chalk.blue('\nℹ️  合集信息:'));
    console.log(`  合集名称: ${chalk.cyan(collectionConfig.resourceName)}`);
    if (collectionConfig.resourceTypeCode) {
      console.log(`  资源类型代码: ${chalk.cyan(collectionConfig.resourceTypeCode)}`);
    }
    if (collectionConfig.resourceType && collectionConfig.resourceType.length > 0) {
      console.log(`  资源类型: ${chalk.cyan(collectionConfig.resourceType.join(', '))}`);
    }
    if (collectionConfig.resourceTitle) {
      console.log(`  资源标题: ${chalk.cyan(collectionConfig.resourceTitle)}`);
    }
    if (collectionConfig.intro) {
      console.log(`  资源介绍: ${chalk.cyan(collectionConfig.intro)}`);
    }
    if (collectionConfig.coverImages && collectionConfig.coverImages.length > 0) {
      console.log(`  封面图: ${chalk.cyan(collectionConfig.coverImages.length)} 张`);
    }
    if (collectionConfig.tags && collectionConfig.tags.length > 0) {
      console.log(`  标签: ${chalk.cyan(collectionConfig.tags.join(', '))}`);
    }

    // 7. 确认创建
    const { confirmCreate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmCreate',
        message: '确认创建合集资源？',
        default: true,
      },
    ]);

    if (!confirmCreate) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 8. 调用 API 创建资源
    const createSpinner = ora('正在创建合集资源...').start();
    let requestBody: CreateResourceBody | undefined;
    try {
      requestBody = collectionConfigToCreateBody(collectionConfig);
      
      // 显示请求信息（用于调试）
      if (options.debug) {
        console.log(chalk.gray('\n[调试] 请求信息:'));
        console.log(chalk.gray(`  接口: POST /v2/resources`));
        console.log(chalk.gray(`  请求数据:`));
        console.log(chalk.gray(JSON.stringify(requestBody, null, 2)));
      }
      
      const result = await createResource(requestBody);

      createSpinner.succeed(`合集资源创建成功: ${result.resourceId}`);

      // 9. 更新本地配置（保存所有字段，包括 policies 和 status）
      const createdConfig = responseToCollectionConfig(result);
      collectionConfig.resourceId = createdConfig.resourceId;
      collectionConfig.resourceName = createdConfig.resourceName;
      collectionConfig.resourceType = createdConfig.resourceType;
      collectionConfig.resourceTitle = createdConfig.resourceTitle;
      collectionConfig.intro = createdConfig.intro;
      collectionConfig.coverImages = createdConfig.coverImages;
      collectionConfig.tags = createdConfig.tags;
      collectionConfig.resourceTypeCode = createdConfig.resourceTypeCode;
      collectionConfig.status = createdConfig.status;
      collectionConfig.policies = createdConfig.policies; // 保存策略信息（包含 policyId）
      // 保留 catalogueProperty（如果配置中有）
      if (collectionConfig.catalogueProperty) {
        createdConfig.catalogueProperty = collectionConfig.catalogueProperty;
      }

      await saveCollectionConfig(collectionConfig, options.config);

      // 10. 显示结果
      console.log(chalk.green('\n✔ ') + '合集资源创建完成');
      console.log(chalk.blue('ℹ️  资源 ID: ') + chalk.cyan(result.resourceId));
      console.log(chalk.blue('ℹ️  资源名称: ') + chalk.cyan(result.resourceName));
      console.log(chalk.blue('ℹ️  资源类型: ') + chalk.cyan(result.resourceType.join(', ')));
      
      console.log(chalk.green('✔ ') + '配置文件已更新');
      console.log(chalk.blue('ℹ️ ') + `配置文件: ${chalk.cyan('freelog.collection.config.*')}`);
      
      console.log(chalk.blue('\n💡 下一步:'));
      console.log(`  ${chalk.gray('$')} freelog-cli2 collection update --intro "介绍" ${chalk.gray('# 更新合集介绍')}`);
      console.log(`  ${chalk.gray('$')} freelog-cli2 collection item add <resourceId>  ${chalk.gray('# 添加单品')}`);
      console.log(`  ${chalk.gray('$')} freelog-cli2 collection policy add            ${chalk.gray('# 添加策略')}\n`);

    } catch (err: any) {
      createSpinner.fail('创建合集资源失败');
      
      // 显示请求信息（用于排查错误）
      console.log(chalk.yellow('\n📋 请求信息:'));
      console.log(chalk.yellow(`  接口: ${chalk.cyan('POST /v2/resources')}`));
      
      // 如果错误中有请求配置信息，显示完整URL
      if (err?.response?.config) {
        const config = err.response.config;
        const baseURL = config.baseURL || '';
        const url = config.url || '';
        const fullUrl = baseURL ? `${baseURL}${url}` : url;
        console.log(chalk.yellow(`  完整URL: ${chalk.cyan(fullUrl)}`));
        console.log(chalk.yellow(`  请求方法: ${chalk.cyan(config.method?.toUpperCase() || 'POST')}`));
      }
      
      // 显示请求数据（使用实际发送的 body）
      if (requestBody) {
        console.log(chalk.yellow(`  请求数据:`));
        console.log(chalk.gray(JSON.stringify(requestBody, null, 2)));
      } else {
        // 如果 requestBody 未定义，重新构建（可能发生在构建 body 时出错）
        try {
          const body = collectionConfigToCreateBody(collectionConfig);
          console.log(chalk.yellow(`  请求数据:`));
          console.log(chalk.gray(JSON.stringify(body, null, 2)));
        } catch (buildError: any) {
          console.log(chalk.red(`  构建请求数据失败: ${buildError.message}`));
        }
      }
      
      throw err;
    }

  } catch (err: any) {
    handleErrorAndExit(err, '创建合集资源失败', options.debug);
  }
}

