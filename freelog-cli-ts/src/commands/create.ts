/**
 * create 命令
 * 创建 Freelog 资源
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../types';
import { requireAuth } from '../core/auth';
import {
  loadResourceConfig,
  saveResourceConfig,
  resourceConfigToCreateBody,
  responseToResourceConfig,
} from '../services/resourceConfigService';
import { createResource, type CreateResourceBody } from '../api/resource';
import { handleErrorAndExit } from '../utils/errorHandler';
import { confirmAuth } from '../utils/authConfirm';

/**
 * 执行 create 命令
 */
export async function executeCreate(
  name?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 创建 Freelog 资源 ===\n'));

    // 1. 验证登录并确认用户信息
    requireAuth();
    await confirmAuth(options.skipConfirm);

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

    // 3. 检查 resourceId 是否已存在
    if (resourceConfig.resourceId) {
      const { confirmOverwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmOverwrite',
          message: `资源配置中已有 resourceId: ${resourceConfig.resourceId}，是否继续创建新资源？`,
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
      resourceConfig.resourceName = name;
    }

    // 5. 交互式输入缺失的必填字段
    if (!resourceConfig.resourceName || !resourceConfig.resourceName.trim()) {
      const { resourceName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'resourceName',
          message: '请输入资源名称（必填）:',
          validate: (input: string) => {
            if (!input.trim()) {
              return '资源名称不能为空';
            }
            return true;
          },
        },
      ]);
      resourceConfig.resourceName = resourceName.trim();
    }
    
    if (!resourceConfig.resourceTitle || !resourceConfig.resourceTitle.trim()) {
      const { resourceTitle } = await inquirer.prompt([
        {
          type: 'input',
          name: 'resourceTitle',
          message: '请输入资源标题（必填）:',
          validate: (input: string) => {
            if (!input.trim()) {
              return '资源标题不能为空';
            }
            return true;
          },
        },
      ]);
      resourceConfig.resourceTitle = resourceTitle.trim();
    }

    // 检查 resourceTypeCode 或 resourceType
    if (!resourceConfig.resourceTypeCode && (!resourceConfig.resourceType || resourceConfig.resourceType.length === 0)) {
      const { resourceTypeCode } = await inquirer.prompt([
        {
          type: 'input',
          name: 'resourceTypeCode',
          message: '请输入资源类型代码（如: theme, widget, package, text 等）:',
          validate: (input: string) => (input.trim() ? true : '资源类型代码不能为空'),
        },
      ]);
      resourceConfig.resourceTypeCode = resourceTypeCode.trim();
      // 同时设置 resourceType 数组（用于显示）
      if (!resourceConfig.resourceType) {
        resourceConfig.resourceType = [resourceTypeCode.trim()];
      }
    } else if (!resourceConfig.resourceTypeCode && resourceConfig.resourceType && resourceConfig.resourceType.length > 0) {
      // 如果只有 resourceType 数组，使用第一个作为 resourceTypeCode
      resourceConfig.resourceTypeCode = resourceConfig.resourceType[0];
    }

    // 6. 显示要创建的资源信息
    console.log(chalk.blue('\nℹ️  资源信息:'));
    console.log(`  资源名称: ${chalk.cyan(resourceConfig.resourceName)}`);
    if (resourceConfig.resourceTypeCode) {
      console.log(`  资源类型代码: ${chalk.cyan(resourceConfig.resourceTypeCode)}`);
    }
    if (resourceConfig.resourceType && resourceConfig.resourceType.length > 0) {
      console.log(`  资源类型: ${chalk.cyan(resourceConfig.resourceType.join(', '))}`);
    }
    if (resourceConfig.resourceTitle) {
      console.log(`  资源标题: ${chalk.cyan(resourceConfig.resourceTitle)}`);
    }
    if (resourceConfig.intro) {
      console.log(`  资源介绍: ${chalk.cyan(resourceConfig.intro)}`);
    }
    if (resourceConfig.coverImages && resourceConfig.coverImages.length > 0) {
      console.log(`  封面图: ${chalk.cyan(resourceConfig.coverImages.length)} 张`);
    }
    if (resourceConfig.tags && resourceConfig.tags.length > 0) {
      console.log(`  标签: ${chalk.cyan(resourceConfig.tags.join(', '))}`);
    }

    // 7. 确认创建
    const { confirmCreate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmCreate',
        message: '确认创建资源？',
        default: true,
      },
    ]);

    if (!confirmCreate) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 8. 调用 API 创建资源
    const createSpinner = ora('正在创建资源...').start();
    let requestBody: CreateResourceBody | undefined;
    try {
      requestBody = resourceConfigToCreateBody(resourceConfig);
      
      // 显示请求信息（用于调试）
      if (options.debug) {
        console.log(chalk.gray('\n[调试] 请求信息:'));
        console.log(chalk.gray(`  接口: POST /v2/resources`));
        console.log(chalk.gray(`  请求数据:`));
        console.log(chalk.gray(JSON.stringify(requestBody, null, 2)));
      }
      
      const result = await createResource(requestBody);

      createSpinner.succeed(`资源创建成功: ${result.resourceId}`);

      // 9. 更新本地配置（保存所有字段，包括 policies 和 status）
      const createdConfig = responseToResourceConfig(result);
      resourceConfig.resourceId = createdConfig.resourceId;
      resourceConfig.resourceName = createdConfig.resourceName;
      resourceConfig.resourceType = createdConfig.resourceType;
      resourceConfig.resourceTitle = createdConfig.resourceTitle;
      resourceConfig.intro = createdConfig.intro;
      resourceConfig.coverImages = createdConfig.coverImages;
      resourceConfig.tags = createdConfig.tags;
      resourceConfig.resourceTypeCode = createdConfig.resourceTypeCode;
      resourceConfig.status = createdConfig.status;
      resourceConfig.policies = createdConfig.policies; // 保存策略信息（包含 policyId）

      await saveResourceConfig(resourceConfig, options.config);

      // 10. 显示结果
      console.log(chalk.green('\n✔ ') + '资源创建完成');
      console.log(chalk.blue('ℹ️  资源 ID: ') + chalk.cyan(result.resourceId));
      console.log(chalk.blue('ℹ️  资源名称: ') + chalk.cyan(result.resourceName));
      console.log(chalk.blue('ℹ️  资源类型: ') + chalk.cyan(result.resourceType.join(', ')));
      
      console.log(chalk.green('✔ ') + '配置文件已更新');
      console.log(chalk.blue('ℹ️ ') + `配置文件: ${chalk.cyan('freelog.resource.config.*')}`);
      
      console.log(chalk.blue('\n💡 下一步:'));
      console.log(`  ${chalk.gray('$')} freelog-cli update --intro "介绍" ${chalk.gray('# 更新资源介绍')}`);
      console.log(`  ${chalk.gray('$')} freelog-cli update --cover "url1,url2" ${chalk.gray('# 更新封面图')}`);
      console.log(`  ${chalk.gray('$')} freelog-cli sync ${chalk.gray('# 同步最新资源信息')}`);
      console.log(`  ${chalk.gray('$')} freelog-cli publish ${chalk.gray('# 发布资源版本')}`);
      console.log(`  ${chalk.gray('$')} freelog-cli dep add <resourceId> ${chalk.gray('# 添加依赖')}\n`);

    } catch (err: any) {
      createSpinner.fail('创建资源失败');
      
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
          const body = resourceConfigToCreateBody(resourceConfig);
          console.log(chalk.yellow(`  请求数据:`));
          console.log(chalk.gray(JSON.stringify(body, null, 2)));
        } catch (buildError: any) {
          console.log(chalk.red(`  构建请求数据失败: ${buildError.message}`));
        }
      }
      
      throw err;
    }

  } catch (err: any) {
    handleErrorAndExit(err, '创建资源失败', options.debug);
  }
}

