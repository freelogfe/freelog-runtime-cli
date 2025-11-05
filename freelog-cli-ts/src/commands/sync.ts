/**
 * 同步命令
 */

import ora from 'ora';
import chalk from 'chalk';
import apiClient from '../core/http';
import { requireAuth } from '../core/auth';
import { readConfig, updateConfig } from '../core/config';
import { CommandOptions } from '../types';

export async function executeSync(resourceIdOrName: string, options: CommandOptions = {}): Promise<void> {
  try {
    requireAuth();
    
    console.log(chalk.cyan('\n=== 同步项目配置 ===\n'));
    console.log(chalk.blue('ℹ ') + `资源: ${resourceIdOrName}`);
    
    const spinner = ora('正在获取资源信息...').start();
    
    try {
      // 获取资源信息
      const resourceResponse = await apiClient.get(`/v2/resources/${resourceIdOrName}`);
      const resource = resourceResponse.data.data;
      
      spinner.text = '正在获取版本信息...';
      
      // 获取版本信息
      const version = options.version || 'latest';
      const versionResponse = await apiClient.get(
        `/v2/resources/${resource.resourceId}/versions/${version}`
      );
      const versionData = versionResponse.data.data;
      
      spinner.succeed('信息获取成功');
      
      // 读取或创建配置
      let config;
      try {
        config = readConfig();
      } catch {
        config = {
          name: resource.resourceName,
          version: versionData.version,
          workId: resource.resourceId,
          intro: resource.intro || '',
          dependencies: [],
          resourceType: resource.resourceType
        };
      }
      
      // 更新配置
      config.name = resource.resourceName;
      config.workId = resource.resourceId;
      config.intro = resource.intro || '';
      config.resourceType = resource.resourceType;
      config.version = versionData.version;
      
      if (versionData.dependencies) {
        config.dependencies = versionData.dependencies;
      }
      
      // 保存配置
      updateConfig(config);
      
      console.log(chalk.green('\n✔ ') + '配置同步成功!');
      console.log(chalk.blue('ℹ ') + `作品名称: ${config.name}`);
      console.log(chalk.blue('ℹ ') + `版本: ${config.version}`);
      console.log(chalk.blue('ℹ ') + `资源ID: ${config.workId}`);
      console.log(chalk.blue('ℹ ') + `依赖数量: ${config.dependencies?.length || 0}\n`);
      
    } catch (err: any) {
      spinner.fail('同步失败');
      console.log(chalk.red('✖ ') + err.message);
      process.exit(1);
    }
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `同步失败: ${err.message}`);
    process.exit(1);
  }
}

