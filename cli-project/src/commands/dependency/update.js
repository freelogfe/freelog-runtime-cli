/**
 * 更新依赖命令
 */

const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const apiClient = require('../../core/api');
const { requireAuth } = require('../../core/auth');
const { readConfig, updateConfig } = require('../../core/config');
const { logOperation, logError } = require('../../core/logger');
const { selectVersion } = require('../../utils/version-selector');

/**
 * 解析资源标识符
 */
function parseResource(resource) {
  if (resource.startsWith('http://') || resource.startsWith('https://')) {
    const match = resource.match(/\/resource\/([^@\s]+)(@(.+))?/);
    if (match) {
      return {
        value: match[1],
        version: match[3] || null,
        type: 'id'
      };
    }
  }

  if (resource.includes('@')) {
    const [value, version] = resource.split('@');
    return {
      value,
      version: version || null,
      type: value.match(/^[0-9a-f]{24}$/i) ? 'id' : 'name'
    };
  }

  return {
    value: resource,
    version: null,
    type: resource.match(/^[0-9a-f]{24}$/i) ? 'id' : 'name'
  };
}

/**
 * 查找现有依赖
 */
function findExistingDependency(config, resourceId, resourceName) {
  return config.dependencies.find(dep =>
    dep.resourceId === resourceId ||
    dep.resourceName === resourceName ||
    dep.name === resourceName
  );
}

/**
 * 执行更新依赖命令
 */
async function executeUpdate(resources, options) {
  try {
    // 1. 登录检查
    requireAuth();

    logOperation('update_dependency', { resources, options });

    console.log(`\n正在更新依赖...\n`);

    // 2. 读取配置
    const config = readConfig(process.cwd(), true);

    // 3. 处理每个资源
    for (const resource of resources) {
      try {
        await updateSingleDependency(resource, config, options);
      } catch (err) {
        console.log(chalk.red('✖ ') + `更新 ${resource} 失败: ${err.message}`);
        logError(err);
        // 继续处理下一个
      }
    }

    // 4. 保存配置
    let saveSpinner = ora('正在保存配置...');

    try {
      updateConfig(config);
      spinner.succeed('配置保存成功');
      saveSpinner = null;

      console.log(chalk.green('✔ ') + `\n依赖更新完成!`);

      logOperation('update_success', {
        count: resources.length
      });
    } catch (err) {
      if (saveSpinner) {
        spinner.fail('保存配置失败');
        saveSpinner = null;
      }
      console.log(chalk.red('✖ ') + err.message);
      logError(err);
      process.exit(1);
    }

  } catch (err) {
    console.log(chalk.red('✖ ') + `执行更新依赖命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

/**
 * 更新单个依赖
 */
async function updateSingleDependency(resource, config, options) {
  console.log(`\n处理: ${resource}`);

  // 1. 解析资源标识符
  const parsed = parseResource(resource);
  let targetVersion = parsed.version;

  // 2. 获取资源信息
  let spinner = ora('正在获取资源信息...');
  let resourceInfo;

  try {
    const response = await apiClient.get(`/v2/resources/${parsed.value}`);
    if (!response || !response.data || !response.data.data) {
      throw new Error('资源信息获取失败');
    }
    resourceInfo = response.data.data;
    spinner.succeed('资源信息获取成功');
    spinner = null;

    console.log(chalk.blue('ℹ ') + `资源: ${resourceInfo.resourceName}`);
  } catch (err) {
    if (spinner) {
      spinner.fail('资源信息获取失败');
      spinner = null;
    }
    throw err;
  }

  // 3. 查找现有依赖
  const existingDep = findExistingDependency(
    config,
    resourceInfo.resourceId || resourceInfo._id,
    resourceInfo.resourceName
  );

  if (!existingDep) {
    console.log(chalk.yellow('⚠ ') + '依赖不存在于配置文件中，跳过');
    console.log(chalk.blue('ℹ ') + '提示: 使用 freelog-cli add 命令添加新依赖');
    return;
  }

  console.log(chalk.blue('ℹ ') + `当前版本: ${existingDep.version}`);

  // 4. 确定目标版本
  if (options.selectVersion) {
    // 交互式选择版本
    const selectedVersion = await selectVersion(
      resourceInfo.resourceId || resourceInfo._id,
      resourceInfo.resourceName
    );

    if (selectedVersion === null) {
      console.log(chalk.blue('ℹ ') + '已取消更新此依赖');
      return;
    }

    targetVersion = selectedVersion;
  } else if (!targetVersion) {
    // 如果没有指定版本，使用最新版本
    targetVersion = 'latest';
  }

  // 5. 获取目标版本信息
  spinner = ora(`正在获取版本 ${targetVersion} 信息...`);

  try {
    const versionResponse = await apiClient.get(
      `/v2/resources/${resourceInfo.resourceId || resourceInfo._id}/versions/${targetVersion}`
    );

    if (!versionResponse || !versionResponse.data || !versionResponse.data.data) {
      throw new Error('版本信息获取失败');
    }

    const actualVersion = versionResponse.data.data.version;
    spinner.succeed('版本信息获取成功');
    spinner = null;

    // 6. 检查版本是否相同
    if (existingDep.version === actualVersion) {
      console.log(chalk.blue('ℹ ') + `版本未变化: ${actualVersion}`);
      console.log(chalk.yellow('⚠ ') + '跳过更新');
      return;
    }

    // 7. 确认更新
    const { confirmUpdate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmUpdate',
        message: `确认更新版本? (${existingDep.version} -> ${actualVersion})`,
        default: true
      }
    ]);

    if (!confirmUpdate) {
      console.log(chalk.blue('ℹ ') + '已取消更新此依赖');
      return;
    }

    // 8. 更新版本
    existingDep.version = actualVersion;
    console.log(chalk.green('✔ ') + `✓ 版本已更新: ${actualVersion}`);

  } catch (err) {
    if (spinner) {
      spinner.fail('获取版本信息失败');
      spinner = null;
    }
    throw err;
  }
}

module.exports = executeUpdate;

