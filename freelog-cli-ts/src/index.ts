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
import { executePolicyAdd } from './commands/policy';
import { executePolicyList } from './commands/policy/list';
import { executeCollectionInit } from './commands/collection/init';
import { executeCollectionCreate } from './commands/collection/create';
import { executeCollectionUpdate } from './commands/collection/update';
import { executeCollectionItemAdd } from './commands/collection/item/add';
import { executeCollectionItemRemove } from './commands/collection/item/remove';
import { executeCollectionDepAdd } from './commands/collection/dep/add';
import { executeCollectionPolicyAdd } from './commands/collection/policy';
import { executeCollectionPublish, executeCollectionUnpublish } from './commands/collection/publish';
import { executeOnline } from './commands/online';
import { executeOffline } from './commands/offline';
import { executeBatchInit } from './commands/batch/init';
import { executeBatchCreate } from './commands/batch/create';
import { executeBatchPublish } from './commands/batch/publish';
import { executeBatchAddToCollection } from './commands/batch/add-to-collection';
import { executeBatchAdd } from './commands/batch/add';

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
  .option('--cover <urls>', '封面图 URL（多个用逗号分隔）')
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

const collectionCommand = new Command('collection')
  .description('合集管理命令');

collectionCommand
  .command('init [name]')
  .description('初始化合集配置')
  .option('-c, --config <path>', '指定合集配置文件路径')
  .option('--debug', '调试模式')
  .action(executeCollectionInit);

collectionCommand
  .command('create [name]')
  .description('创建 Freelog 合集资源')
  .option('-c, --config <path>', '指定合集配置文件路径')
  .option('--debug', '调试模式')
  .action(executeCollectionCreate);

collectionCommand
  .command('update [resource]')
  .description('更新合集资源信息（intro、coverImages、tags、status、catalogueProperty）')
  .option('-c, --config <path>', '指定合集配置文件路径')
  .option('--intro <text>', '资源介绍')
  .option('--cover <urls>', '封面图 URL（多个用逗号分隔）')
  .option('--tags <tags>', '标签（多个用逗号分隔）')
  .option('--status <status>', '资源状态（1:上线 4:下线）')
  .option('--debug', '调试模式')
  .action(executeCollectionUpdate);

const collectionItemCommand = new Command('item')
  .description('合集单品管理命令');

collectionItemCommand
  .command('add <resourceIdOrName>')
  .description('添加合集单品（需要签约支付流程，包括上抛资源）')
  .option('-c, --config <path>', '指定合集配置文件路径')
  .option('--debug', '调试模式')
  .action(executeCollectionItemAdd);

collectionItemCommand
  .command('remove <resourceIdOrName>')
  .description('删除合集单品')
  .option('-c, --config <path>', '指定合集配置文件路径')
  .option('--debug', '调试模式')
  .action(executeCollectionItemRemove);

collectionCommand.addCommand(collectionItemCommand);

const collectionDepCommand = new Command('dep')
  .description('合集依赖管理命令');

collectionDepCommand
  .command('add <resourceIdOrName>')
  .description('为合集添加依赖（需要完整的签约支付流程，包括主资源和上抛资源）')
  .option('-c, --config <path>', '指定合集配置文件路径')
  .option('--debug', '调试模式')
  .action(executeCollectionDepAdd);

collectionCommand.addCommand(collectionDepCommand);

collectionCommand
  .command('policy add')
  .description('为合集添加授权策略')
  .option('-c, --config <path>', '指定合集配置文件路径')
  .option('--debug', '调试模式')
  .action(executeCollectionPolicyAdd);

collectionCommand
  .command('publish')
  .description('上线合集（更新合集信息并提交草稿）')
  .option('-c, --config <path>', '指定合集配置文件路径')
  .option('--debug', '调试模式')
  .action(executeCollectionPublish);

collectionCommand
  .command('unpublish')
  .description('下线合集')
  .option('-c, --config <path>', '指定合集配置文件路径')
  .option('--debug', '调试模式')
  .action(executeCollectionUnpublish);

program.addCommand(collectionCommand);

// ==================== 批量管理命令 ====================

const batchCommand = new Command('batch')
  .description('批量资源管理命令（用于管理合集的单品资源）');

batchCommand
  .command('init [directory]')
  .description('初始化批量资源配置文件（可扫描文件夹自动生成资源列表）')
  .option('-c, --config <path>', '指定批量配置文件路径')
  .option('--debug', '调试模式')
  .action(executeBatchInit);

batchCommand
  .command('create')
  .description('批量创建资源')
  .option('-c, --config <path>', '指定批量配置文件路径')
  .option('--debug', '调试模式')
  .action(executeBatchCreate);

batchCommand
  .command('publish')
  .description('批量发布资源版本')
  .option('-c, --config <path>', '指定批量配置文件路径')
  .option('--debug', '调试模式')
  .action(executeBatchPublish);

batchCommand
  .command('add [filePath]')
  .description('添加单个资源项到批量配置（支持文件或目录）')
  .option('-c, --config <path>', '指定批量配置文件路径')
  .option('--debug', '调试模式')
  .action(executeBatchAdd);

batchCommand
  .command('add-to-collection [collectionConfig]')
  .description('批量将资源添加到合集')
  .option('-c, --config <path>', '指定批量配置文件路径')
  .option('--debug', '调试模式')
  .action(executeBatchAddToCollection);

program.addCommand(batchCommand);

// 解析命令
program.parse();
