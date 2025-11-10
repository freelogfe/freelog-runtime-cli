/**
 * 依赖列表命令
 * 查看当前项目的依赖信息
 */

import ora from 'ora';
import chalk from 'chalk';
import { requireAuth } from '../../core/auth';
import { CommandOptions } from '../../types';
import { loadConfig } from '../../services/configService';
import { getResourceDependencyTree } from '../../api/get';

export async function executeList(options: CommandOptions): Promise<void> {
  try {
    // 1. 检查登录
    const auth = requireAuth();
    console.log(chalk.cyan('\n=== 依赖列表 ===\n'));
    
    // 2. 加载配置文件
    const spinner = ora('正在加载配置...').start();
    let config;
    
    try {
      config = await loadConfig(options.config);
      spinner.succeed('配置加载成功');
    } catch (error) {
      spinner.fail('配置加载失败');
      throw error;
    }
    
    console.log(chalk.blue('ℹ ') + `资源 ID: ${config.resourceId}`);
    console.log(chalk.blue('ℹ ') + `版本号: ${config.version}`);
    
    // 3. 获取依赖树
    const treeSpinner = ora('正在获取依赖树...').start();
    
    try {
      const dependencyTree = await getResourceDependencyTree(
        config.resourceId,
        {
          version: config.version,
          maxDeep: options.depth ? String(options.depth) : undefined,
          isContainRootNode: true,
        }
      );
      
      treeSpinner.succeed('依赖树获取成功');
      
      // 4. 显示依赖信息
      if (!config.dependencies || config.dependencies.length === 0) {
        console.log(chalk.yellow('\n⚠ 当前项目没有依赖'));
        return;
      }
      
      console.log(chalk.cyan('\n=== 直接依赖 ===\n'));
      config.dependencies.forEach((dep, index) => {
        console.log(chalk.green(`${index + 1}. 资源 ID: ${dep.resourceId}`));
        console.log(chalk.gray(`   版本范围: ${dep.versionRange}`));
        console.log();
      });
      
      // 5. 如果有依赖树，显示完整的依赖关系
      if (options.tree && dependencyTree) {
        console.log(chalk.cyan('=== 依赖树 ===\n'));
        printDependencyTree(dependencyTree, '', true);
      }
      
      // 6. 统计信息
      const totalDeps = config.dependencies.length;
      console.log(chalk.blue(`\n共 ${totalDeps} 个直接依赖\n`));
      
    } catch (error: any) {
      treeSpinner.fail('获取依赖树失败');
      
      if (error.response) {
        const errorData = error.response.data;
        console.log(chalk.red('\n❌ 服务器错误:'));
        console.log(chalk.red(`状态码: ${error.response.status}`));
        console.log(chalk.red(`错误信息: ${errorData.msg || errorData.message || '未知错误'}`));
      } else {
        console.log(chalk.red('\n❌ 错误:'));
        console.log(chalk.red(error.message));
      }
      
      process.exit(1);
    }
    
  } catch (error: any) {
    console.log(chalk.red('\n❌ 错误: ') + error.message);
    
    if (error.message.includes('找不到配置文件')) {
      console.log(chalk.yellow('\n💡 提示:'));
      console.log(chalk.yellow('  1. 确保在项目根目录执行命令'));
      console.log(chalk.yellow('  2. 或使用 -c 参数指定配置文件路径'));
    }
    
    if (error.message.includes('未登录')) {
      console.log(chalk.yellow('\n💡 提示: 请先登录'));
      console.log(chalk.yellow('  freelog-cli login'));
    }
    
    process.exit(1);
  }
}

/**
 * 打印依赖树（递归）
 */
function printDependencyTree(node: any, prefix: string = '', isLast: boolean = true): void {
  const connector = isLast ? '└── ' : '├── ';
  const line = prefix + connector;
  
  console.log(line + chalk.green(node.resourceName || node.resourceId));
  
  if (node.version) {
    console.log(prefix + (isLast ? '    ' : '│   ') + chalk.gray(`版本: ${node.version}`));
  }
  
  if (node.dependencies && node.dependencies.length > 0) {
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    node.dependencies.forEach((child: any, index: number) => {
      const isLastChild = index === node.dependencies.length - 1;
      printDependencyTree(child, childPrefix, isLastChild);
    });
  }
}
