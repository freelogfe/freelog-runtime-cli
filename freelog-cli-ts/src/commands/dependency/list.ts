/**
 * 依赖列表命令
 * 查看当前项目的依赖信息
 */

import ora from 'ora';
import chalk from 'chalk';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import { CommandOptions } from '../../types';
import { loadResourceConfig } from '../../services/resourceConfigService';
import { loadVersionConfig } from '../../services/versionConfigService';
import { getAllDependencies } from '../../services/dependencyService';
import { getResourceDependencyTree } from '../../api/version';
import { handleErrorAndExit } from '../../utils/errorHandler';

export async function executeList(options: CommandOptions): Promise<void> {
  try {
    // 1. 检查登录并确认用户信息
    requireAuth();
    await confirmAuth(options.skipConfirm);
    console.log(chalk.cyan('\n=== 依赖列表 ===\n'));
    
    // 2. 加载配置文件
    const spinner = ora('正在加载配置...').start();
    let resourceConfig, versionConfig, dependencies;
    
    try {
      resourceConfig = await loadResourceConfig(options.config);
      versionConfig = await loadVersionConfig(options.config);
      dependencies = await getAllDependencies(options.config);
      spinner.succeed('配置加载成功');
    } catch (error) {
      spinner.fail('配置加载失败');
      throw error;
    }
    
    console.log(chalk.blue('ℹ ') + `资源 ID: ${resourceConfig.resourceId}`);
    console.log(chalk.blue('ℹ ') + `版本号: ${versionConfig.version}`);
    
    // 3. 获取依赖树
    const treeSpinner = ora('正在获取依赖树...').start();
    
    try {
      const dependencyTree = await getResourceDependencyTree(
        resourceConfig.resourceId,
        {
          version: versionConfig.version,
          maxDeep: options.depth ? String(options.depth) : undefined,
          isContainRootNode: true,
        }
      );
      
      treeSpinner.succeed('依赖树获取成功');
      
      // 4. 显示依赖信息
      if (!dependencies || dependencies.length === 0) {
        console.log(chalk.yellow('\n⚠ 当前项目没有依赖'));
        return;
      }
      
      console.log(chalk.cyan('\n=== 直接依赖 ===\n'));
      dependencies.forEach((dep, index) => {
        console.log(chalk.green(`${index + 1}. 资源 ID: ${dep.resourceId}`));
        if (dep.resourceName) {
          console.log(chalk.blue(`   资源名称: ${dep.resourceName}`));
        }
        console.log(chalk.gray(`   版本范围: ${dep.versionRange}`));
        console.log();
      });
      
      // 5. 如果有依赖树，显示完整的依赖关系
      if (options.tree && dependencyTree) {
        console.log(chalk.cyan('=== 依赖树 ===\n'));
        
        // dependencyTree 是数组，如果包含根节点，第一个元素是根节点
        if (Array.isArray(dependencyTree)) {
          if (dependencyTree.length > 0) {
            const rootNode = dependencyTree[0];
            // 显示根节点
            console.log(chalk.green(rootNode.resourceName || rootNode.resourceId));
            if (rootNode.version) {
              console.log(chalk.gray(`版本: ${rootNode.version}`));
            }
            console.log();
            
            // 显示根节点的依赖
            if (rootNode.dependencies && rootNode.dependencies.length > 0) {
              rootNode.dependencies.forEach((child: any, index: number) => {
                const isLastChild = index === rootNode.dependencies.length - 1;
                printDependencyTree(child, '', isLastChild);
              });
            } else {
              console.log(chalk.gray('  └── (无依赖)'));
            }
          }
        } else {
          // 如果不是数组，直接打印
          printDependencyTree(dependencyTree, '', true);
        }
      }
      
      // 6. 统计信息
      const totalDeps = dependencies.length;
      console.log(chalk.blue(`\n共 ${totalDeps} 个直接依赖\n`));
      
    } catch (error: any) {
      treeSpinner.fail('获取依赖树失败');
      
      if (error.response) {
        const errorData = error.response.data;
        console.log(chalk.red('\n❌ 服务器错误:'));
        console.log(chalk.red(`状态码: ${error.response.status}`));
        console.log(chalk.red(`错误信息: ${errorData.msg || errorData.message || '未知错误'}`));
      } else {
        throw error;
      }
    }
    
  } catch (error: any) {
    handleErrorAndExit(error, '查看依赖列表失败', options.debug);
  }
}

/**
 * 打印依赖树（递归）
 */
function printDependencyTree(node: any, prefix: string = '', isLast: boolean = true): void {
  if (!node) {
    return;
  }
  
  const connector = isLast ? '└── ' : '├── ';
  const line = prefix + connector;
  
  // 显示资源名称或ID
  const displayName = node.resourceName || node.resourceId || '(未知资源)';
  console.log(line + chalk.green(displayName));
  
  // 显示版本信息
  if (node.version) {
    console.log(prefix + (isLast ? '    ' : '│   ') + chalk.gray(`版本: ${node.version}`));
  }
  
  // 显示版本范围（如果有）
  if (node.versionRange && node.versionRange !== '*') {
    console.log(prefix + (isLast ? '    ' : '│   ') + chalk.gray(`版本范围: ${node.versionRange}`));
  }
  
  // 递归显示子依赖
  if (node.dependencies && Array.isArray(node.dependencies) && node.dependencies.length > 0) {
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    node.dependencies.forEach((child: any, index: number) => {
      const isLastChild = index === node.dependencies.length - 1;
      printDependencyTree(child, childPrefix, isLastChild);
    });
  }
}
