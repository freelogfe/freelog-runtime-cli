#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import { executeLogin, executeLogout, executeStatus } from './commands/auth';
import { executeInit } from './commands/init';
import { executeAdd } from './commands/dependency/add';
import { executeRemove } from './commands/dependency/remove';
import { executeList } from './commands/dependency/list';
import { executeUpdate } from './commands/dependency/update';
import { executeChange } from './commands/dependency/change';
import { executePublish } from './commands/publish';
import { executeSync } from './commands/sync';
import { executeAnalyze } from './commands/analyze';

const program = new Command();

console.log(chalk.cyan(figlet.textSync('Freelog CLI', { horizontalLayout: 'default' })));

program
  .name('freelog-cli')
  .description('Freelog CLI - 作品开发与发布工具 (TypeScript)')
  .version('1.0.0')
  .option('-t, --test', '使用测试环境')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();
    if (options.test) {
      process.env.FREELOG_ENV = 'development';
      console.log(chalk.yellow('ℹ 使用测试环境\n'));
    } else if (!process.env.FREELOG_ENV) {
      process.env.FREELOG_ENV = 'production';
    }
  });

// ==================== 认证命令 ====================

program
  .command('login')
  .description('用户登录')
  .option('-g, --global', '全局登录')
  .option('-u, --username <username>', '用户名')
  .option('-p, --password <password>', '密码')
  .action(executeLogin);

program
  .command('logout')
  .description('退出登录')
  .option('-g, --global', '退出全局登录')
  .action(executeLogout);

program
  .command('status')
  .description('查看登录状态')
  .action(executeStatus);

// ==================== 项目命令 ====================

program
  .command('init [name]')
  .description('初始化项目')
  .action(executeInit);

program
  .command('publish')
  .description('发布作品')
  .option('-d, --draft', '发布为草稿')
  .option('-m, --message <message>', '更新说明')
  .action(executePublish);

program
  .command('sync <resource>')
  .description('同步项目配置')
  .option('-v, --version <version>', '版本号')
  .action(executeSync);

program
  .command('analyze [path]')
  .description('分析项目文件')
  .action(executeAnalyze);

// ==================== 依赖命令 ====================

program
  .command('add <resource>')
  .description('添加依赖')
  .option('-sv, --select-version', '交互式选择版本')
  .action(executeAdd);

program
  .command('remove <resources...>')
  .description('移除依赖')
  .action(executeRemove);

program
  .command('list')
  .description('查看依赖列表')
  .option('-r, --remote', '查看线上依赖')
  .option('-v, --version <version>', '版本号（用于线上查询）')
  .action(executeList);

program
  .command('update <resources...>')
  .description('更新依赖版本')
  .option('-sv, --select-version', '交互式选择版本')
  .action(executeUpdate);

program
  .command('change <resource>')
  .description('修改依赖配置')
  .action(executeChange);

// 解析命令
program.parse();
