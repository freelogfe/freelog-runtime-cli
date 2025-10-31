/**
 * 更新依赖命令
 */

const inquirer = require('inquirer');
const { requireAuth } = require('../../core/auth');
const { readConfig, updateConfig } = require('../../core/config');
const { getResource, getResourceVersion } = require('../../core/api');
const { logOperation, logError } = require('../../core/logger');
const { startSpinner, succeedSpinner, failSpinner } = require('../../utils/spinner');
const { success, error, warning, info } = require('../../utils/output');
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
        error(`更新 ${resource} 失败: ${err.message}`);
        logError(err);
        // 继续处理下一个
      }
    }

    // 4. 保存配置
    let saveSpinner = startSpinner('正在保存配置...');

    try {
      updateConfig(config);
      succeedSpinner('配置保存成功');
      saveSpinner = null;

      success(`\n依赖更新完成!`);

      logOperation('update_success', {
        count: resources.length
      });
    } catch (err) {
      if (saveSpinner) {
        failSpinner('保存配置失败');
        saveSpinner = null;
      }
      error(err.message);
      logError(err);
      process.exit(1);
    }

  } catch (err) {
    error(`执行更新依赖命令失败: ${err.message}`);
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
  let spinner = startSpinner('正在获取资源信息...');
  let resourceInfo;

  try {
    const result = await getResource(parsed.value);
    if (!result || !result.data) {
      throw new Error('资源信息获取失败');
    }
    resourceInfo = result.data;
    succeedSpinner('资源信息获取成功');
    spinner = null;

    info(`资源: ${resourceInfo.resourceName}`);
  } catch (err) {
    if (spinner) {
      failSpinner('资源信息获取失败');
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
    warning('依赖不存在于配置文件中，跳过');
    info('提示: 使用 freelog-cli add 命令添加新依赖');
    return;
  }

  info(`当前版本: ${existingDep.version}`);

  // 4. 确定目标版本
  if (options.selectVersion) {
    // 交互式选择版本
    const selectedVersion = await selectVersion(
      resourceInfo.resourceId || resourceInfo._id,
      resourceInfo.resourceName
    );

    if (selectedVersion === null) {
      info('已取消更新此依赖');
      return;
    }

    targetVersion = selectedVersion;
  } else if (!targetVersion) {
    // 如果没有指定版本，使用最新版本
    targetVersion = 'latest';
  }

  // 5. 获取目标版本信息
  spinner = startSpinner(`正在获取版本 ${targetVersion} 信息...`);

  try {
    const versionResult = await getResourceVersion(
      resourceInfo.resourceId || resourceInfo._id,
      targetVersion
    );

    if (!versionResult || !versionResult.data) {
      throw new Error('版本信息获取失败');
    }

    const actualVersion = versionResult.data.version;
    succeedSpinner('版本信息获取成功');
    spinner = null;

    // 6. 检查版本是否相同
    if (existingDep.version === actualVersion) {
      info(`版本未变化: ${actualVersion}`);
      warning('跳过更新');
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
      info('已取消更新此依赖');
      return;
    }

    // 8. 更新版本
    existingDep.version = actualVersion;
    success(`✓ 版本已更新: ${actualVersion}`);

  } catch (err) {
    if (spinner) {
      failSpinner('获取版本信息失败');
      spinner = null;
    }
    throw err;
  }
}

module.exports = executeUpdate;

