/**
 * 输出格式化工具（仅保留有业务价值的复杂格式化）
 * 简单的 success/error/info/warning 请直接使用 chalk
 */

const chalk = require('chalk');
const Table = require('cli-table3');

/**
 * 创建表格
 */
function createTable(options = {}) {
  return new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
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
 */
function printAuthStatus(authStatus) {
  console.log(chalk.bold.cyan('\n登录状态\n'));
  
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
 * 打印配置验证结果
 */
function printValidationResult(result) {
  if (result.valid) {
    console.log(chalk.green('✔ 配置文件验证通过'));
  } else {
    console.log(chalk.red('✖ 配置文件验证失败'));
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

module.exports = {
  createTable,
  printDependenciesTable,
  printAuthStatus,
  printValidationResult
};

