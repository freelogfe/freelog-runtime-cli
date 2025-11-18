#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import { readFileSync } from 'fs';
import { join } from 'path';
import { executeLogin, executeLogout, executeStatus } from './commands/auth';
import { executeInit } from './commands/init';
import { executeCreate } from './commands/create';
import { executeUpdateResource } from './commands/updateResource';
import { executeAdd } from './commands/dependency/add';
import { executeRemove } from './commands/dependency/remove';
import { executeList } from './commands/dependency/list';
import { executeUpdate } from './commands/dependency/update';
import { executeChange } from './commands/dependency/change';
import { executeDependencySync } from './commands/dependency/sync';
import { executePublish } from './commands/publish';
import { executeSyncr } from './commands/syncr';
import { executeSyncv } from './commands/syncv';

// 读取 package.json 获取版本号
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

const program = new Command();

console.log(chalk.cyan(figlet.textSync('Freelog CLI', { horizontalLayout: 'default' })));

program
  .name('freelog-cli')
  .description('Freelog CLI - 作品开发与发布工具 (TypeScript)')
  .version(packageJson.version, '-v, --version', '显示版本号')
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
  .description('初始化项目（支持主题、插件、前端库和其余资源）')
  .option('-f, --force', '强制清空目录')
  .option('--debug', '调试模式')
  .action(executeInit);

program
  .command('create [name]')
  .description('创建 Freelog 资源')
  .option('-c, --config <path>', '指定资源配置文件路径')
  .option('--debug', '调试模式')
  .action(executeCreate);

program
  .command('update [resource]')
  .description('更新资源信息（intro、coverImages、tags、status）')
  .option('-c, --config <path>', '指定资源配置文件路径')
  .option('--intro <text>', '资源介绍')
  .option('--cover <urls>', '封面图 URL（多个用逗号分隔）')
  .option('--tags <tags>', '标签（多个用逗号分隔）')
  .option('--status <status>', '资源状态（1:上线 4:下线）')
  .option('--debug', '调试模式')
  .action(executeUpdateResource);

program
  .command('publish')
  .description('发布作品')
  .option('-d, --draft', '发布为草稿')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('-m, --message <message>', '更新说明')
  .action(executePublish);

program
  .command('syncr [resourceIdOrName]')
  .description('同步资源信息到本地配置')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('--debug', '调试模式')
  .action(executeSyncr);

program
  .command('syncv [resourceIdOrName]')
  .description('同步版本信息到本地配置')
  .option('-v, --version <version>', '指定版本号或 latest（不传则使用配置文件版本或最新版本）')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('--debug', '调试模式')
  .action(executeSyncv);


// ==================== 依赖命令 ====================

program
  .command('dep add <resourceIdOrName>')
  .description('添加依赖')
  .option('-sv, --select-version', '交互式选择版本')
  .option('-c, --config <path>', '指定配置文件路径')
  .action(executeAdd);

program
  .command('dep remove <resourceIdOrName>')
  .description('移除依赖')
  .option('-c, --config <path>', '指定配置文件路径')
  .action(executeRemove);

program
  .command('dep list')
  .description('查看依赖列表')
  .option('--tree', '以树形结构显示')
  .option('-c, --config <path>', '指定配置文件路径')
  .action(executeList);

program
  .command('dep update <resourceIdOrName>')
  .description('更新依赖版本')
  .option('-sv, --select-version', '交互式选择版本')
  .option('-c, --config <path>', '指定配置文件路径')
  .action(executeUpdate);

program
  .command('dep change <resource>')
  .description('修改依赖配置')
  .option('-c, --config <path>', '指定配置文件路径')
  .action(executeChange);

program
  .command('dep sync [version]')
  .description('同步依赖版本（默认交互式选择，传 latest 更新所有依赖到最新版本）')
  .option('-c, --config <path>', '指定配置文件路径')
  .action(executeDependencySync);

// 解析命令
program.parse();
