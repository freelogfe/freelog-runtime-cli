/**
 * 修改依赖命令（change 类似 add，但针对已存在的依赖）
 */

import inquirer from 'inquirer';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import apiClient from '../../core/api';
import { requireAuth } from '../../core/auth';
import { readConfig, updateConfig } from '../../core/config';
import { CommandOptions } from '../../types';

function parseResource(resource: string): { value: string; version?: string } {
  const parts = resource.split('@');
  return parts.length === 1 ? { value: parts[0] } : { value: parts[0], version: parts[1] };
}

export async function executeChange(resource: string, options: CommandOptions = {}): Promise<void> {
  try {
    requireAuth();
    
    const parsed = parseResource(resource);
    console.log(chalk.blue('ℹ ') + `正在修改依赖: ${parsed.value}`);
    
    // 1. 读取配置
    const config = readConfig(process.cwd(), true);
    
    if (!config.dependencies || config.dependencies.length === 0) {
      console.log(chalk.yellow('⚠ ') + '当前没有依赖');
      return;
    }
    
    // 2. 查找现有依赖
    const existingDep = config.dependencies.find((dep: any) =>
      dep.resourceId === parsed.value ||
      dep.resourceName === parsed.value ||
      dep.name === parsed.value
    );
    
    if (!existingDep) {
      console.log(chalk.red('✖ ') + `未找到依赖: ${parsed.value}`);
      console.log(chalk.blue('ℹ ') + '使用 freelog-cli add 添加新依赖');
      return;
    }
    
    console.log(chalk.blue('ℹ ') + `当前依赖: ${existingDep.name || existingDep.resourceName}@${existingDep.version}`);
    
    // 3. 选择修改内容
    const { changeType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'changeType',
        message: '请选择要修改的内容:',
        choices: [
          { name: '修改版本', value: 'version' },
          { name: '重新选择策略并签约', value: 'policy' },
          { name: '取消', value: 'cancel' }
        ]
      }
    ]);
    
    if (changeType === 'cancel') {
      console.log(chalk.blue('ℹ ') + '已取消');
      return;
    }
    
    // 4. 修改版本
    if (changeType === 'version') {
      let targetVersion = parsed.version;
      
      if (!targetVersion) {
        const { version } = await inquirer.prompt([
          {
            type: 'input',
            name: 'version',
            message: '请输入新版本:',
            validate: (input: string) => input ? true : '版本号不能为空'
          }
        ]);
        targetVersion = version;
      }
      
      existingDep.version = targetVersion;
      existingDep.versionRange = targetVersion === 'latest' ? '*' : `^${targetVersion}`;
      
      console.log(chalk.green('✔ ') + `版本已更新: ${targetVersion}`);
    }
    
    // 5. 修改策略
    if (changeType === 'policy') {
      console.log(chalk.blue('ℹ ') + '重新选择策略...');
      
      // 获取策略列表
      const spinner: Ora = ora('正在获取策略列表...').start();
      
      try {
        const response = await apiClient.get(`/v2/resources/${existingDep.resourceId}/policies`);
        const policies = response.data.data || [];
        
        spinner.succeed(`找到 ${policies.length} 个策略`);
        
        if (policies.length === 0) {
          console.log(chalk.yellow('⚠ ') + '该资源没有可用策略');
          return;
        }
        
        const policyChoices = policies.map((policy: any) => ({
          name: `${policy.policyName} - ${policy.description || '无描述'}`,
          value: policy.policyId,
          short: policy.policyName
        }));
        
        policyChoices.push({
          name: '上抛（不签约）',
          value: 'bubble',
          short: '上抛'
        });
        
        const { selectedPolicyId } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedPolicyId',
            message: '请选择策略:',
            choices: policyChoices
          }
        ]);
        
        if (selectedPolicyId === 'bubble') {
          existingDep.policyId = null;
          console.log(chalk.green('✔ ') + '已设置为上抛');
        } else {
          existingDep.policyId = selectedPolicyId;
          console.log(chalk.green('✔ ') + '策略已更新');
          console.log(chalk.yellow('⚠ ') + '注意: 可能需要重新签约');
        }
        
      } catch (err: any) {
        spinner.fail('获取策略列表失败');
        console.log(chalk.red('✖ ') + err.message);
        return;
      }
    }
    
    // 6. 保存配置
    const saveSpinner = ora('正在保存配置...').start();
    
    try {
      updateConfig(config);
      saveSpinner.succeed('配置保存成功');
      
      console.log(chalk.green('\n✔ ') + '依赖修改完成!');
      
    } catch (err: any) {
      saveSpinner.fail('保存配置失败');
      console.log(chalk.red('✖ ') + err.message);
      process.exit(1);
    }
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `执行修改依赖命令失败: ${err.message}`);
    process.exit(1);
  }
}

