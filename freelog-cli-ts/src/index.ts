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
import { executeUpdateVersion } from './commands/updateVersion';
import { executeAdd } from './commands/dependency/add';
import { executeRemove } from './commands/dependency/remove';
import { executeList } from './commands/dependency/list';
import { executeUpdate } from './commands/dependency/update';
import { executeChange } from './commands/dependency/change';
import { executeDependencySync } from './commands/dependency/sync';
import { executePublish } from './commands/publish';
import { executeSyncr } from './commands/syncr';
import { executeSyncv } from './commands/syncv';
import { executePolicyAdd } from './commands/policy';
import { executePolicyList } from './commands/policy/list';
import { executeOnline } from './commands/online';
import { executeOffline } from './commands/offline';
import { createCollectionCommand } from './commands/collection';
import { createBatchCommand } from './commands/batch';

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
  .option('--debug', '调试模式')
  .hook('preAction', (thisCommand, actionCommand) => {
    const options = thisCommand.opts();
    if (options.test) {
      process.env.FREELOG_ENV = 'development';
      console.log(chalk.yellow('ℹ 使用测试环境\n'));
    } else if (!process.env.FREELOG_ENV) {
      process.env.FREELOG_ENV = 'production';
    }
    // 将全局 debug 选项传递给子命令
    if (options.debug && actionCommand) {
      actionCommand.setOptionValue('debug', true);
    }
  });

// ==================== 认证命令 ====================

program
  .command('login')
  .description('用户登录')
  .option('-g, --global', '全局登录')
  .option('-u, --username <username>', '用户名')
  .option('-p, --password <password>', '密码')
  .option('--debug', '调试模式')
  .action(executeLogin);

program
  .command('logout')
  .description('退出登录')
  .option('-g, --global', '退出全局登录')
  .option('--debug', '调试模式')
  .action(executeLogout);

program
  .command('status')
  .description('查看登录状态')
  .option('--debug', '调试模式')
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
  .option('--cover <path>', '封面图：已上传的图片URL或本地文件路径（本地文件会自动上传）')
  .option('--tags <tags>', '标签（多个用逗号分隔）')
  .option('--status <status>', '资源状态（1:上线 4:下线）')
  .option('--debug', '调试模式')
  .action(executeUpdateResource);

// ==================== 策略命令 ====================

const policyCommand = new Command('policy')
  .description('策略管理命令');

policyCommand
  .command('add')
  .description('为资源添加授权策略')
  .option('-c, --config <path>', '指定资源配置文件路径')
  .option('--debug', '调试模式')
  .action(executePolicyAdd);

policyCommand
  .command('list')
  .description('列出策略并管理策略状态（启用/停用）')
  .option('-c, --config <path>', '指定资源配置文件路径')
  .option('--debug', '调试模式')
  .action(executePolicyList);

program.addCommand(policyCommand);

program
  .command('updateVersion')
  .description('更新版本配置信息（version、description、filename、filePath）')
  .option('-c, --config <path>', '指定版本配置文件路径')
  .option('--version <version>', '版本号（格式: x.y.z）')
  .option('--description <text>', '版本描述')
  .option('--filename <filename>', '文件名')
  .option('--filePath <path>', '文件路径（相对于当前目录）')
  .option('--debug', '调试模式')
  .action(executeUpdateVersion);

program
  .command('publish')
  .description('发布作品')
  .option('-d, --draft', '发布为草稿')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('-m, --message <message>', '更新说明')
  .option('--debug', '调试模式')
  .action(executePublish);

program
  .command('online [resourceIdOrName]')
  .description('上架资源（支持普通资源和合集资源）')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('--debug', '调试模式')
  .action(executeOnline);

program
  .command('offline [resourceIdOrName]')
  .description('下架资源（支持普通资源和合集资源）')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('--debug', '调试模式')
  .action(executeOffline);

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

const depCommand = new Command('dep')
  .description('依赖管理命令');

depCommand
  .command('add <resourceIdOrName>')
  .description('添加依赖')
  .option('-sv, --select-version', '交互式选择版本')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('--debug', '调试模式')
  .action(executeAdd);

depCommand
  .command('remove <resourceIdOrName>')
  .description('移除依赖')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('--debug', '调试模式')
  .action(executeRemove);

depCommand
  .command('list')
  .description('查看依赖列表')
  .option('--tree', '以树形结构显示')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('--debug', '调试模式')
  .action(executeList);

depCommand
  .command('update <resourceIdOrName>')
  .description('更新依赖版本')
  .option('-sv, --select-version', '交互式选择版本')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('--debug', '调试模式')
  .action(executeUpdate);

depCommand
  .command('change <resource>')
  .description('修改依赖配置')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('--debug', '调试模式')
  .action(executeChange);

depCommand
  .command('sync [version]')
  .description('同步依赖版本（默认交互式选择，传 latest 更新所有依赖到最新版本）')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('--debug', '调试模式')
  .action(executeDependencySync);

program.addCommand(depCommand);

// ==================== 合集命令 ====================

program.addCommand(createCollectionCommand());

// ==================== 批量管理命令 ====================

program.addCommand(createBatchCommand());

// 解析命令
program.parse();
