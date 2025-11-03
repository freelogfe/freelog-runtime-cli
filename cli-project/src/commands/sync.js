/**
 * 信息同步命令
 */

const inquirer = require('inquirer');
const { requireAuth } = require('../core/auth');
const { readConfig, writeConfig, updateConfig } = require('../core/config');
const { getResource, getResourceVersion } = require('../core/api');
const { logOperation, logError } = require('../core/logger');
const { startSpinner, succeedSpinner, failSpinner } = require('../utils/spinner');
const { success, error, warning, info, title } = require('../utils/output');
const { parseResourceIdentifier } = require('../utils/validator');
const { FreelogError } = require('../core/errors');

/**
 * 执行同步命令
 * @param {string} resourceIdentifier - 资源标识符（可选）
 * @param {Object} options - 命令选项
 */
async function executeSync(resourceIdentifier, options) {
  try {
    logOperation('sync', { resourceIdentifier, options });
    
    // 1. 检查登录状态
    try {
      requireAuth();
    } catch (err) {
      error(err.toString());
      process.exit(1);
    }
    
    // 2. 如果提供了资源标识符，则初始化同步
    if (resourceIdentifier) {
      await initializeSync(resourceIdentifier);
      return;
    }
    
    // 3. 如果指定了同步作品信息
    if (options.work) {
      await syncWorkInfo(options);
      return;
    }
    
    // 4. 如果指定了同步所有信息
    if (options.all) {
      await syncAllInfo(options);
      return;
    }
    
    // 5. 同步部分信息
    if (options.props || options.config || options.changelog) {
      await syncPartialInfo(options);
      return;
    }
    
    // 6. 默认行为：交互式选择同步内容
    await interactiveSync(options);
    
  } catch (err) {
    error(`执行同步命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

/**
 * 初始化同步（从线上拉取作品信息并创建配置文件）
 */
async function initializeSync(resourceIdentifier) {
  const parsed = parseResourceIdentifier(resourceIdentifier);
  
  title('初始化项目配置');
  info(`资源: ${parsed.value}`);
  if (parsed.version) {
    info(`版本: ${parsed.version}`);
  }
  
  let spinner = startSpinner('正在获取资源信息...');
  
  try {
    // 获取资源信息
    const resourceInfo = await getResource(parsed.value);
    
    if (!resourceInfo || !resourceInfo.data) {
      throw new Error('资源信息获取失败');
    }
    
    const resource = resourceInfo.data;
    
    // 获取版本信息
    const version = parsed.version || 'latest';
    const versionInfo = await getResourceVersion(resource.resourceId || resource._id, version);
    
    if (!versionInfo || !versionInfo.data) {
      throw new Error('版本信息获取失败');
    }
    
    const versionData = versionInfo.data;
    
    succeedSpinner('资源信息获取成功');
    spinner = null;
    
    // 创建配置文件（匹配实际的 freelog.json 格式）
    const config = {
      version: versionData.version || version,
      workId: resource.resourceId || resource._id,
      name: resource.resourceName,
      publishPath: 'dist',
      description: versionData.description || resource.intro || '',
      baseUpcastResources: versionData.baseUpcastResources || [],
      dependencies: versionData.dependencies || [],
      resolveResources: versionData.resolveResources || [],
      inputAttrs: versionData.customPropertyDescriptors || [],
      customPropertyDescriptors: versionData.customPropertyDescriptors || []
    };
    
    // 检查配置文件是否已存在
    try {
      const existingConfig = readConfig();
      if (existingConfig) {
        warning('配置文件已存在');
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: '是否覆盖现有配置?',
            default: false
          }
        ]);
        
        if (!overwrite) {
          info('已取消同步');
          return;
        }
      }
    } catch (err) {
      // 配置文件不存在，继续
    }
    
    // 写入配置文件
    writeConfig(config);
    
    success('配置文件创建成功!');
    success(`资源: ${config.name}`);
    success(`workId: ${config.workId}`);
    success(`版本: ${config.version}`);
    info('配置文件已保存到: freelog.json');
    
    logOperation('initialize_sync_success', {
      workId: config.workId,
      version: config.version
    });
    
  } catch (err) {
    if (spinner) {
      failSpinner('获取资源信息失败');
      spinner = null;
    }
    
    if (err instanceof FreelogError) {
      error(err.toString());
    } else {
      error(`同步失败: ${err.message}`);
    }
    
    logError(err);
    process.exit(1);
  }
}

/**
 * 同步作品信息
 */
async function syncWorkInfo() {
  const config = readConfig(process.cwd(), true);
  
  if (!config.workId) {
    error('配置文件中缺少 workId');
    process.exit(1);
  }
  
  title('同步作品信息');
  
  let spinner = startSpinner('正在同步...');
  
  try {
    const resourceInfo = await getResource(config.workId);
    
    if (!resourceInfo || !resourceInfo.data) {
      throw new Error('资源信息获取失败');
    }
    
    const resource = resourceInfo.data;
    
    // 更新基本信息
    config.name = resource.resourceName;
    config.description = resource.intro || config.description;
    
    updateConfig(config);
    
    succeedSpinner('作品信息同步成功');
    spinner = null;
    success(`资源: ${config.name}`);
    success(`workId: ${config.workId}`);
    
    logOperation('sync_work_success', { workId: config.workId });
    
  } catch (err) {
    if (spinner) {
      failSpinner('同步失败');
      spinner = null;
    }
    error(`同步失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

/**
 * 同步所有信息
 */
async function syncAllInfo(options) {
  const config = readConfig(process.cwd(), true);
  
  if (!config.workId) {
    error('配置文件中缺少 workId');
    process.exit(1);
  }
  
  const version = options.version || 'latest';
  
  title(`同步所有信息 (版本: ${version})`);
  
  let spinner = startSpinner('正在同步...');
  
  try {
    const resourceInfo = await getResource(config.workId);
    const versionInfo = await getResourceVersion(config.workId, version);
    
    if (!resourceInfo || !resourceInfo.data || !versionInfo || !versionInfo.data) {
      throw new Error('信息获取失败');
    }
    
    const resource = resourceInfo.data;
    const versionData = versionInfo.data;
    
    const updates = {
      version: versionData.version || version,
      name: resource.resourceName,
      description: versionData.description || resource.intro || config.description,
      baseUpcastResources: versionData.baseUpcastResources || [],
      dependencies: versionData.dependencies || [],
      resolveResources: versionData.resolveResources || [],
      customPropertyDescriptors: versionData.customPropertyDescriptors || [],
      inputAttrs: versionData.customPropertyDescriptors || []
    };
    
    if (options.force) {
      writeConfig({ ...config, ...updates });
    } else {
      updateConfig(updates);
    }
    
    succeedSpinner('所有信息同步成功');
    spinner = null;
    success(`版本: ${updates.version}`);
    success(`依赖: ${updates.dependencies.length} 个`);
    success(`自定义属性: ${updates.customPropertyDescriptors.length} 个`);
    
    logOperation('sync_all_success', {
      workId: config.workId,
      version: updates.version
    });
    
  } catch (err) {
    if (spinner) {
      failSpinner('同步失败');
      spinner = null;
    }
    error(`同步失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

/**
 * 同步部分信息
 */
async function syncPartialInfo(options) {
  const config = readConfig(process.cwd(), true);
  
  if (!config.workId) {
    error('配置文件中缺少 workId');
    process.exit(1);
  }
  
  const version = options.version || config.version || 'latest';
  
  title(`同步部分信息 (版本: ${version})`);
  
  let spinner = startSpinner('正在同步...');
  
  try {
    const versionInfo = await getResourceVersion(config.workId, version);
    
    if (!versionInfo || !versionInfo.data) {
      throw new Error('版本信息获取失败');
    }
    
    const versionData = versionInfo.data;
    const updates = {};
    
    if (options.props) {
      updates.customPropertyDescriptors = versionData.customPropertyDescriptors || [];
      updates.inputAttrs = versionData.customPropertyDescriptors || [];
      info('✓ 自定义属性');
    }
    
    if (options.config) {
      updates.dependencies = versionData.dependencies || [];
      updates.baseUpcastResources = versionData.baseUpcastResources || [];
      updates.resolveResources = versionData.resolveResources || [];
      info('✓ 依赖配置');
    }
    
    if (options.changelog) {
      updates.description = versionData.description || config.description;
      info('✓ 描述信息');
    }
    
    updateConfig(updates);
    
    succeedSpinner('信息同步成功');
    spinner = null;
    
    logOperation('sync_partial_success', {
      workId: config.workId,
      version,
      fields: Object.keys(updates)
    });
    
  } catch (err) {
    if (spinner) {
      failSpinner('同步失败');
      spinner = null;
    }
    error(`同步失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

/**
 * 交互式同步
 */
async function interactiveSync() {
  const config = readConfig(process.cwd(), true);
  
  if (!config.workId) {
    error('配置文件中缺少 workId');
    error('请先执行: freelog-cli sync <resourceIdOrName>');
    process.exit(1);
  }
  
  title('同步配置');
  info(`当前资源: ${config.name || config.workId}`);
  
  const { syncOptions } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'syncOptions',
      message: '请选择要同步的内容:',
      choices: [
        { name: '作品基本信息', value: 'work', checked: true },
        { name: '自定义属性', value: 'props', checked: true },
        { name: '依赖配置', value: 'dependencies', checked: true },
        { name: '描述信息', value: 'description', checked: false }
      ]
    }
  ]);
  
  if (syncOptions.length === 0) {
    info('未选择任何同步内容');
    return;
  }
  
  const { version } = await inquirer.prompt([
    {
      type: 'input',
      name: 'version',
      message: '请输入版本号（留空使用最新版本）:',
      default: 'latest'
    }
  ]);
  
  let spinner = startSpinner('正在同步...');
  
  try {
    const versionInfo = await getResourceVersion(config.workId, version);
    
    if (!versionInfo || !versionInfo.data) {
      throw new Error('版本信息获取失败');
    }
    
    const versionData = versionInfo.data;
    const updates = {};
    
    if (syncOptions.includes('work')) {
      const resourceInfo = await getResource(config.workId);
      if (resourceInfo && resourceInfo.data) {
        updates.name = resourceInfo.data.resourceName;
      }
    }
    
    if (syncOptions.includes('props')) {
      updates.customPropertyDescriptors = versionData.customPropertyDescriptors || [];
      updates.inputAttrs = versionData.customPropertyDescriptors || [];
    }
    
    if (syncOptions.includes('dependencies')) {
      updates.dependencies = versionData.dependencies || [];
      updates.baseUpcastResources = versionData.baseUpcastResources || [];
      updates.resolveResources = versionData.resolveResources || [];
    }
    
    if (syncOptions.includes('description')) {
      updates.description = versionData.description || config.description;
    }
    
    // 更新版本号
    updates.version = versionData.version || version;
    
    updateConfig(updates);
    
    succeedSpinner('同步成功');
    spinner = null;
    success(`已同步 ${syncOptions.length} 项内容`);
    success(`版本: ${updates.version}`);
    
    logOperation('interactive_sync_success', {
      workId: config.workId,
      version: updates.version,
      options: syncOptions
    });
    
  } catch (err) {
    if (spinner) {
      failSpinner('同步失败');
      spinner = null;
    }
    error(`同步失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

module.exports = executeSync;

