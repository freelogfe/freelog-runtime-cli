/**
 * 删除依赖命令
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { readConfig, updateConfig } from '../../core/config';
import { CommandOptions } from '../../types';

function parseResourceIdentifier(identifier: string): { value: string } {
  const parts = identifier.split('@');
  return { value: parts[0] };
}

export async function executeRemove(resourceIdentifiers: string | string[], options: CommandOptions = {}): Promise<void> {
  try {
    const identifiers = Array.isArray(resourceIdentifiers) ? resourceIdentifiers : [resourceIdentifiers];
    
    // 1. 读取配置文件
    const config = readConfig(process.cwd(), true);
    
    if (!config.dependencies || config.dependencies.length === 0) {
      console.log(chalk.yellow('⚠ ') + '当前没有任何依赖');
      return;
    }
    
    // 2. 解析资源标识符
    const parsedIdentifiers = identifiers.map(id => {
      const parsed = parseResourceIdentifier(id);
      return parsed.value;
    });
    
    // 3. 查找要删除的依赖
    const toRemove: any[] = [];
    const notFound: string[] = [];
    
    parsedIdentifiers.forEach(identifier => {
      const dep = config.dependencies!.find(
        (d: any) => d.resourceId === identifier || d.name === identifier || d.resourceName === identifier
      );
      
      if (dep) {
        toRemove.push(dep);
      } else {
        notFound.push(identifier);
      }
    });
    
    // 4. 显示未找到的依赖
    if (notFound.length > 0) {
      console.log(chalk.yellow('⚠ ') + `以下依赖未找到:`);
      notFound.forEach(id => {
        console.log(`  - ${id}`);
      });
    }
    
    // 5. 如果没有要删除的依赖
    if (toRemove.length === 0) {
      console.log(chalk.red('✖ ') + '没有找到要删除的依赖');
      return;
    }
    
    // 6. 显示要删除的依赖
    console.log('\n将要删除以下依赖:');
    toRemove.forEach(dep => {
      console.log(`  - ${dep.name || dep.resourceName} (${dep.version})`);
    });
    console.log();
    
    // 7. 确认删除
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `确定要删除 ${toRemove.length} 个依赖吗?`,
        default: false
      }
    ]);
    
    if (!confirmed) {
      console.log(chalk.blue('ℹ ') + '已取消删除');
      return;
    }
    
    // 8. 执行删除
    const resourceIdsToRemove = toRemove.map(dep => dep.resourceId);
    config.dependencies = config.dependencies!.filter(
      (dep: any) => !resourceIdsToRemove.includes(dep.resourceId)
    );
    
    // 9. 保存配置
    try {
      updateConfig(config);
      
      console.log(chalk.green('✔ ') + `成功删除 ${toRemove.length} 个依赖`);
      
      toRemove.forEach(dep => {
        console.log(chalk.blue('ℹ ') + `  ✓ ${dep.name || dep.resourceName}`);
      });
      
    } catch (err: any) {
      console.log(chalk.red('✖ ') + `保存配置失败: ${err.message}`);
      process.exit(1);
    }
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `执行删除依赖命令失败: ${err.message}`);
    process.exit(1);
  }
}

