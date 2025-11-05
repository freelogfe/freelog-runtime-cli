/**
 * 版本选择工具
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import apiClient from '../core/http';

/**
 * 交互式选择版本
 * @param resourceId - 资源ID
 * @param resourceName - 资源名称（用于显示）
 * @returns 选择的版本号，如果取消则返回 null
 */
export async function selectVersion(resourceId: string, resourceName: string): Promise<string | null> {
  const spinner = ora('正在获取版本列表...').start();

  try {
    // 直接调用 API
    const result = await apiClient.get(`/v2/resources/${resourceId}/versions`, {
      params: {
        projection: 'version,createDate,description'
      }
    });

    if (!result || !result.data || !result.data.dataList) {
      throw new Error('版本列表获取失败');
    }

    const versions = result.data.dataList;

    if (versions.length === 0) {
      spinner.fail('未找到可用版本');
      console.log(chalk.red('✖ ') + '该资源没有可用版本');
      return null;
    }

    spinner.succeed(`找到 ${versions.length} 个版本`);

    // 构建版本选择列表
    const choices = versions.map((v: any, index: number) => {
      const isLatest = index === 0;
      const date = v.createDate ? new Date(v.createDate).toLocaleDateString('zh-CN') : '';
      const desc = v.description || '';

      let name = `${v.version}`;
      if (isLatest) {
        name += chalk.green(' (最新版本)');
      }
      if (date) {
        name += ` - ${date}`;
      }
      if (desc && desc.length > 0) {
        const shortDesc = desc.length > 50 ? desc.substring(0, 50) + '...' : desc;
        name += ` - ${chalk.gray(shortDesc)}`;
      }

      return {
        name,
        value: v.version,
        short: v.version
      };
    });

    // 添加取消选项
    choices.push({
      name: chalk.gray('取消选择'),
      value: null as any,
      short: '取消'
    });

    // 提示用户选择
    console.log(chalk.blue('ℹ ') + `资源: ${resourceName}`);
    console.log();

    const { selectedVersion } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedVersion',
        message: '请选择版本:',
        choices,
        pageSize: 15
      }
    ]);

    return selectedVersion;

  } catch (err: any) {
    spinner.fail('获取版本列表失败');
    console.log(chalk.red('✖ ') + `错误: ${err.message}`);
    return null;
  }
}

