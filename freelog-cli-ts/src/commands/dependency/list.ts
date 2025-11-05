/**
 * 查询依赖列表命令
 */

import ora from 'ora';
import chalk from 'chalk';
import apiClient from '../../core/http';
import { readConfig } from '../../core/config';
import { CommandOptions } from '../../types';

async function getDependencies(resourceId: string, version: string): Promise<any[]> {
  const response = await apiClient.get(`/v2/resources/${resourceId}/versions/${version}`, {
    params: { projection: 'dependencies' }
  });
  return response.data.data?.dependencies || [];
}

function printDependenciesTable(dependencies: any[]): void {
  dependencies.forEach((dep, index) => {
    console.log(`${index + 1}. ${chalk.green(dep.name || dep.resourceName)}@${chalk.yellow(dep.version)}`);
    console.log(`   资源ID: ${chalk.gray(dep.resourceId)}`);
    if (dep.policyId) {
      console.log(`   策略ID: ${chalk.gray(dep.policyId)}`);
    }
    if (dep.authStatus !== undefined) {
      console.log(`   授权状态: ${dep.authStatus ? chalk.green('已授权') : chalk.yellow('未授权')}`);
    }
  });
}

export async function executeList(options: CommandOptions = {}): Promise<void> {
  try {
    // 1. 读取配置文件
    const config = readConfig(process.cwd(), true);
    
    // 2. 如果指定了远程查询
    if (options.remote) {
      if (!config.workId) {
        console.log(chalk.red('✖ ') + '配置文件中缺少资源ID');
        console.log(chalk.red('✖ ') + '请先完善配置文件或执行 freelog-cli sync');
        process.exit(1);
      }
      
      const version = options.version || 'latest';
      console.log(chalk.bold.cyan('\n线上依赖列表 (' + version + ')'));
      
      const spinner = ora('正在获取线上依赖列表...').start();
      
      try {
        const remoteDeps = await getDependencies(config.workId, version);
        spinner.succeed(`找到 ${remoteDeps.length} 个依赖`);
        
        if (remoteDeps.length === 0) {
          console.log(chalk.yellow('⚠ ') + '该版本没有依赖');
          return;
        }
        
        console.log();
        printDependenciesTable(remoteDeps);
        
      } catch (err: any) {
        spinner.fail('获取线上依赖列表失败');
        console.log(chalk.red('✖ ') + err.message);
        process.exit(1);
      }
      
    } else {
      // 3. 显示本地依赖列表
      console.log(chalk.bold.cyan('\n本地依赖列表 (' + (config.version || '未知') + ')'));
      
      if (!config.dependencies || config.dependencies.length === 0) {
        console.log(chalk.yellow('⚠ ') + '当前没有任何依赖');
        return;
      }
      
      console.log();
      printDependenciesTable(config.dependencies);
      
      // 显示统计信息
      const authorizedCount = config.dependencies.filter((d: any) => d.authStatus).length;
      const unauthorizedCount = config.dependencies.length - authorizedCount;
      
      console.log();
      console.log(`总计: ${config.dependencies.length} 个依赖`);
      console.log(`已授权: ${authorizedCount} 个`);
      console.log(`未授权: ${unauthorizedCount} 个`);
    }
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `执行查询依赖列表命令失败: ${err.message}`);
    process.exit(1);
  }
}

