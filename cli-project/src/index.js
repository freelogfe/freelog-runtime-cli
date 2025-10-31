#!/usr/bin/env node

/**
 * Freelog CLI 主入口文件
 */

const { Command } = require('commander');
const chalk = require('chalk');
const figlet = require('figlet');
const { FreelogError } = require('./constants/errors');
const { logError } = require('./core/logger');

// 导入命令
const { executeLogin, executeLogout, executeStatus } = require('./commands/auth');
const executePublish = require('./commands/publish');
const { executeAdd, executeRemove, executeList } = require('./commands/dependency');
const executeSync = require('./commands/sync');
const executeAnalyze = require('./commands/analyze');
const executeInit = require('./commands/init');

const program = new Command();

// 显示Banner
console.log(
  chalk.cyan(
    figlet.textSync('Freelog CLI', {
      font: 'Standard',
      horizontalLayout: 'default'
    })
  )
);

// 配置 CLI
program
  .name('freelog-cli')
  .description('Freelog CLI - 作品开发与发布工具')
  .version('1.0.0', '-v, --version', '显示版本号');

// ===== 初始化命令 =====
program
  .command('init [project-name]')
  .description('初始化新项目')
  .option('-t, --template <template>', '指定模板名称')
  .option('--list', '列出所有可用模板')
  .option('-f, --force', '强制覆盖已存在的目录')
  .action(executeInit);

// ===== 登录命令 =====
program
  .command('login')
  .description('用户登录')
  .option('-g, --global', '全局登录')
  .option('-u, --username <username>', '用户名')
  .option('-p, --password <password>', '密码')
  .action(executeLogin);

// ===== 登出命令 =====
program
  .command('logout')
  .description('用户登出')
  .option('-g, --global', '全局登出')
  .action(executeLogout);

// ===== 登录状态命令 =====
program
  .command('status')
  .description('查看登录状态')
  .option('-g, --global', '仅显示全局登录状态')
  .action(executeStatus);

// ===== 发布命令 =====
program
  .command('publish')
  .description('发布作品')
  .option('-gu, --global-user', '使用全局登录用户')
  .option('-wu, --workspace-user', '使用工作空间登录用户')
  .option('-d, --draft', '发布为草稿')
  .option('-f, --file <path>', '指定作品文件路径')
  .option('-c, --config <path>', '指定配置文件路径')
  .option('-m, --message <message>', '版本更新说明')
  .option('--major', '主版本号递增')
  .option('--minor', '次版本号递增')
  .option('--patch', '补丁版本号递增')
  .action(executePublish);

// ===== 添加依赖命令 =====
program
  .command('add <resource>')
  .description('添加依赖')
  .option('-sv, --select-version', '交互式选择版本')
  .action(executeAdd);

// ===== 修改依赖命令 =====
const executeChange = require('./commands/dependency/change');

program
  .command('change <resource>')
  .description('修改依赖')
  .option('-sv, --select-version', '交互式选择版本')
  .action(executeChange);

// ===== 删除依赖命令 =====
program
  .command('remove <resources...>')
  .description('删除依赖')
  .action(executeRemove);

// ===== 更新依赖命令 =====
const executeUpdate = require('./commands/dependency/update');

program
  .command('update <resources...>')
  .description('更新依赖版本')
  .option('-sv, --select-version', '交互式选择版本')
  .action(executeUpdate);

// ===== 依赖管理命令组 =====
const depCommand = program
  .command('dep')
  .description('依赖管理命令');

// dep list - 查询依赖列表
depCommand
  .command('list')
  .description('查询依赖列表')
  .option('-v, --version <version>', '指定版本号或 latest')
  .option('--remote', '查询线上版本')
  .option('--auth', '显示授权状态')
  .action(executeList);

// dep sync - 同步依赖
depCommand
  .command('sync')
  .description('同步依赖列表')
  .option('-v, --version <version>', '指定版本号或 latest')
  .option('-f, --force', '强制覆盖本地配置')
  .action((options) => {
    console.log(chalk.yellow('该功能正在开发中...'));
    console.log('选项:', options);
  });

// dep update - 更新依赖
depCommand
  .command('update <resources...>')
  .description('更新依赖版本')
  .option('-sv, --select-version', '交互式选择版本')
  .action(executeUpdate);

// ===== 同步命令 =====
program
  .command('sync [resource]')
  .description('同步信息')
  .option('-a, --all', '同步所有信息')
  .option('-v, --version <version>', '指定版本号')
  .option('-f, --force', '强制覆盖本地配置')
  .option('--work', '同步作品信息')
  .option('--props', '仅同步属性信息')
  .option('--config', '仅同步配置信息')
  .option('--changelog', '仅同步更新说明')
  .action(executeSync);

// ===== 分析命令 =====
program
  .command('analyze')
  .description('分析文件属性')
  .option('-f, --file <path>', '指定文件路径')
  .option('-o, --output <path>', '输出分析结果到文件')
  .option('--format <format>', '输出格式 (json|table)', 'json')
  .action(executeAnalyze);

// ===== 全局错误处理 =====
process.on('uncaughtException', (error) => {
  console.error(chalk.red('\n✖ 发生未捕获的错误:\n'));
  
  if (error instanceof FreelogError) {
    console.error(chalk.red(error.toString()));
  } else {
    console.error(chalk.red(error.message));
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
  }
  
  logError(error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('\n✖ 发生未处理的 Promise 拒绝:\n'));
  console.error(chalk.red(reason));
  
  logError(new Error(String(reason)));
  process.exit(1);
});

// 自定义帮助信息
program.on('--help', () => {
  console.log('');
  console.log('示例:');
  console.log('  $ freelog-cli init my-project');
  console.log('  $ freelog-cli login -g');
  console.log('  $ freelog-cli publish');
  console.log('  $ freelog-cli add resource-id@1.0.0');
  console.log('  $ freelog-cli sync -a');
  console.log('');
  console.log('更多信息:');
  console.log('  文档: https://freelog.com/docs');
  console.log('  问题反馈: https://github.com/freelog/cli/issues');
  console.log('');
});

// 解析命令行参数
program.parse(process.argv);

// 如果没有提供任何命令，显示帮助信息
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

