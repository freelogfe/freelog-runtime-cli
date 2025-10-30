/**
 * 输出格式化工具
 */

const chalk = require('chalk');
const Table = require('cli-table3');

/**
 * 打印成功消息
 * @param {string} message - 消息内容
 */
function success(message) {
  console.log(chalk.green('✔ ') + message);
}

/**
 * 打印错误消息
 * @param {string} message - 消息内容
 */
function error(message) {
  console.log(chalk.red('✖ ') + message);
}

/**
 * 打印警告消息
 * @param {string} message - 消息内容
 */
function warning(message) {
  console.log(chalk.yellow('⚠ ') + message);
}

/**
 * 打印信息消息
 * @param {string} message - 消息内容
 */
function info(message) {
  console.log(chalk.blue('ℹ ') + message);
}

/**
 * 打印标题
 * @param {string} title - 标题内容
 */
function title(title) {
  console.log('\n' + chalk.bold.cyan(title) + '\n');
}

/**
 * 打印分隔线
 */
function divider() {
  console.log(chalk.gray('─'.repeat(50)));
}

/**
 * 创建表格
 * @param {Object} options - 表格选项
 * @returns {Object} 表格实例
 */
function createTable(options = {}) {
  return new Table({
    chars: {
      'top': '─',
      'top-mid': '┬',
      'top-left': '┌',
      'top-right': '┐',
      'bottom': '─',
      'bottom-mid': '┴',
      'bottom-left': '└',
      'bottom-right': '┘',
      'left': '│',
      'left-mid': '├',
      'mid': '─',
      'mid-mid': '┼',
      'right': '│',
      'right-mid': '┤',
      'middle': '│'
    },
    style: {
      head: ['cyan'],
      border: ['gray']
    },
    ...options
  });
}

/**
 * 打印依赖列表表格
 * @param {Array} dependencies - 依赖列表
 */
function printDependenciesTable(dependencies) {
  const table = createTable({
    head: ['名称', '版本', '授权状态', '签约策略']
  });
  
  dependencies.forEach(dep => {
    table.push([
      dep.name || dep.resourceId,
      dep.version,
      dep.authStatus ? chalk.green('✓ 已授权') : chalk.red('✗ 未授权'),
      dep.policyName || '-'
    ]);
  });
  
  console.log(table.toString());
}

/**
 * 打印登录状态
 * @param {Object} authStatus - 登录状态
 */
function printAuthStatus(authStatus) {
  title('登录状态');
  
  if (authStatus.global) {
    console.log(chalk.bold('全局登录:'));
    console.log(`  用户名: ${chalk.cyan(authStatus.global.username || authStatus.global.email)}`);
    console.log(`  登录时间: ${new Date(authStatus.global.loginTime).toLocaleString()}`);
    console.log(`  Token 有效期: ${authStatus.global.expireDays} 天`);
  } else {
    console.log(chalk.gray('全局登录: 未登录'));
  }
  
  console.log();
  
  if (authStatus.workspace) {
    console.log(chalk.bold('工作空间登录:'));
    console.log(`  用户名: ${chalk.cyan(authStatus.workspace.username || authStatus.workspace.email)}`);
    console.log(`  登录时间: ${new Date(authStatus.workspace.loginTime).toLocaleString()}`);
    console.log(`  Token 有效期: ${authStatus.workspace.expireDays} 天`);
    console.log(`  项目: ${chalk.gray(authStatus.workspace.projectPath)}`);
  } else {
    console.log(chalk.gray('工作空间登录: 未登录'));
  }
}

/**
 * 打印版本信息
 * @param {string} currentVersion - 当前版本
 * @param {string} newVersion - 新版本
 */
function printVersionChange(currentVersion, newVersion) {
  console.log(`版本变更: ${chalk.yellow(currentVersion)} → ${chalk.green(newVersion)}`);
}

/**
 * 打印进度
 * @param {number} current - 当前值
 * @param {number} total - 总值
 * @param {string} label - 标签
 */
function printProgress(current, total, label = '') {
  const percentage = Math.round((current / total) * 100);
  const barLength = 30;
  const filledLength = Math.round((barLength * current) / total);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  
  process.stdout.write(`\r${label} [${bar}] ${percentage}%`);
  
  if (current >= total) {
    process.stdout.write('\n');
  }
}

/**
 * 打印配置验证结果
 * @param {Object} result - 验证结果
 */
function printValidationResult(result) {
  if (result.valid) {
    success('配置文件验证通过');
  } else {
    error('配置文件验证失败');
  }
  
  if (result.errors && result.errors.length > 0) {
    console.log(chalk.red('\n错误:'));
    result.errors.forEach(err => {
      console.log(chalk.red(`  • ${err}`));
    });
  }
  
  if (result.warnings && result.warnings.length > 0) {
    console.log(chalk.yellow('\n警告:'));
    result.warnings.forEach(warn => {
      console.log(chalk.yellow(`  • ${warn}`));
    });
  }
}

/**
 * 打印模板列表
 * @param {Array} templates - 模板列表
 */
function printTemplateList(templates) {
  title('可用模板');
  
  templates.forEach(template => {
    console.log(`  ${chalk.cyan(template.name.padEnd(20))} ${chalk.gray(template.description)}`);
  });
}

module.exports = {
  success,
  error,
  warning,
  info,
  title,
  divider,
  createTable,
  printDependenciesTable,
  printAuthStatus,
  printVersionChange,
  printProgress,
  printValidationResult,
  printTemplateList
};

