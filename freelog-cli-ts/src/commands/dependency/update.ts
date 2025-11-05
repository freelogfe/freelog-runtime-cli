/**
 * 更新依赖命令
 */

import inquirer from 'inquirer';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import apiClient from '../../core/http';
import { requireAuth } from '../../core/auth';
import { readConfig, updateConfig } from '../../core/config';
import { CommandOptions } from '../../types';
import { selectVersion } from '../../utils/version-selector';

function parseResource(resource: string): { value: string; version: string | null; type: string } {
  if (resource.includes('@')) {
    const [value, version] = resource.split('@');
    return {
      value,
      version: version || null,
      type: value.match(/^[0-9a-f]{24}$/i) ? 'id' : 'name'
    };
  }

  return {
    value: resource,
    version: null,
    type: resource.match(/^[0-9a-f]{24}$/i) ? 'id' : 'name'
  };
}

function findExistingDependency(config: any, resourceId: string, resourceName: string): any {
  return config.dependencies?.find((dep: any) =>
    dep.resourceId === resourceId ||
    dep.resourceName === resourceName ||
    dep.name === resourceName
  );
}

async function updateSingleDependency(resource: string, config: any, options: CommandOptions): Promise<void> {
  const parsed = parseResource(resource);
  
  console.log(chalk.blue('ℹ ') + `处理: ${parsed.value}`);
  
  // 1. 获取资源信息
  let spinner = ora('正在获取资源信息...').start();
  let resourceInfo: any;
  
  try {
    const response = await apiClient.get(`/v2/resources/${parsed.value}`);
    resourceInfo = response.data.data;
    spinner.succeed('资源信息获取成功');
  } catch (err: any) {
    spinner.fail('获取资源信息失败');
    throw err;
  }
  
  // 2. 查找现有依赖
  const existingDep = findExistingDependency(config, resourceInfo.resourceId, resourceInfo.resourceName);
  
  if (!existingDep) {
    console.log(chalk.yellow('⚠ ') + `依赖不存在: ${resourceInfo.resourceName}`);
    return;
  }
  
  // 3. 确定目标版本
  let targetVersion = parsed.version;
  
  if (!targetVersion && options.selectVersion) {
    // 交互式选择版本
    const selectedVersion = await selectVersion(resourceInfo.resourceId, resourceInfo.resourceName);
    
    if (selectedVersion === null) {
      console.log(chalk.blue('ℹ ') + '已取消');
      return;
    }
    
    targetVersion = selectedVersion;
    console.log(chalk.green('✔ ') + `已选择版本: ${targetVersion}`);
  }
  
  if (!targetVersion) {
    const { useLatest } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useLatest',
        message: '是否更新到最新版本?',
        default: true
      }
    ]);
    
    if (useLatest) {
      targetVersion = 'latest';
    } else {
      const { version } = await inquirer.prompt([
        {
          type: 'input',
          name: 'version',
          message: '请输入目标版本:',
          validate: (input: string) => input ? true : '版本号不能为空'
        }
      ]);
      targetVersion = version;
    }
  }
  
  // 4. 获取版本信息
  spinner = ora(`正在获取版本 ${targetVersion} 信息...`).start();
  
  try {
    const versionResponse = await apiClient.get(
      `/v2/resources/${resourceInfo.resourceId}/versions/${targetVersion}`
    );
    
    const actualVersion = versionResponse.data.data.version;
    spinner.succeed('版本信息获取成功');
    
    // 5. 检查版本是否相同
    if (existingDep.version === actualVersion) {
      console.log(chalk.yellow('⚠ ') + `已经是版本 ${actualVersion}，无需更新`);
      return;
    }
    
    // 6. 确认更新
    console.log(`\n  当前版本: ${chalk.yellow(existingDep.version)}`);
    console.log(`  目标版本: ${chalk.green(actualVersion)}\n`);
    
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: '确认更新?',
        default: true
      }
    ]);
    
    if (!confirmed) {
      console.log(chalk.blue('ℹ ') + '已取消更新');
      return;
    }
    
    // 7. 更新依赖
    existingDep.version = actualVersion;
    existingDep.versionRange = actualVersion === 'latest' ? '*' : `^${actualVersion}`;
    
    console.log(chalk.green('✔ ') + `${resourceInfo.resourceName} 已更新到 ${actualVersion}`);
    
  } catch (err: any) {
    spinner.fail('获取版本信息失败');
    throw err;
  }
}

export async function executeUpdate(resources: string | string[], options: CommandOptions = {}): Promise<void> {
  try {
    requireAuth();
    
    const resourceList = Array.isArray(resources) ? resources : [resources];
    
    console.log(`\n正在更新依赖...\n`);
    
    const config = readConfig(process.cwd(), true);
    
    for (const resource of resourceList) {
      try {
        await updateSingleDependency(resource, config, options);
      } catch (err: any) {
        console.log(chalk.red('✖ ') + `更新 ${resource} 失败: ${err.message}`);
      }
    }
    
    const saveSpinner = ora('正在保存配置...').start();
    
    try {
      updateConfig(config);
      saveSpinner.succeed('配置保存成功');
      
      console.log(chalk.green('✔ ') + `\n依赖更新完成!`);
      
    } catch (err: any) {
      saveSpinner.fail('保存配置失败');
      console.log(chalk.red('✖ ') + err.message);
      process.exit(1);
    }
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `执行更新依赖命令失败: ${err.message}`);
    process.exit(1);
  }
}

