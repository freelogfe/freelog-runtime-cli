/**
 * 信息同步命令
 */

const inquirer = require('inquirer');
const { requireAuth } = require('../../core/auth');
const { readConfig, writeConfig, updateConfig } = require('../../core/config');
const { getResource, getResourceVersion } = require('../../core/api');
const { logOperation, logError } = require('../../core/logger');
const { startSpinner, succeedSpinner, failSpinner } = require('../../utils/spinner');
const { success, error, warning, info, title } = require('../../utils/output');
const { parseResourceIdentifier } = require('../../utils/validator');
const { FreelogError } = require('../../constants/errors');

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
  
  const spinner = startSpinner('正在获取资源信息...');
  
  try {
    // 获取资源信息
    const resourceInfo = await getResource(parsed.value);
    
    // 获取版本信息
    const version = parsed.version || 'latest';
    const versionInfo = await getResourceVersion(resourceInfo.resourceId, version);
    
    succeedSpinner('资源信息获取成功');
    
    // 创建配置文件
    const config = {
      version: versionInfo.version,
      type: 'object',
      local: {
        buildDir: './dist',
        entryFile: './dist/index.html',
        excludes: ['node_modules', '*.log', '.git']
      },
      resource: {
        resourceId: resourceInfo.resourceId,
        resourceName: resourceInfo.resourceName,
        resourceType: resourceInfo.resourceType,
        coverImages: resourceInfo.coverImages || [],
        description: resourceInfo.description || '',
        tags: resourceInfo.tags || []
      },
      properties: versionInfo.properties || [],
      customOptions: versionInfo.customOptions || [],
      changelog: versionInfo.changelog || {},
      dependencies: versionInfo.dependencies || []
    };
    
    // 检查配置文件是否已存在
    if (readConfig()) {
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
    
    // 写入配置文件
    writeConfig(config);
    
    success('配置文件创建成功!');
    success(`资源: ${resourceInfo.resourceName}`);
    success(`版本: ${versionInfo.version}`);
    info(`配置文件已保存到: freelog.json`);
    
    logOperation('initialize_sync_success', {
      resourceId: resourceInfo.resourceId,
      version: versionInfo.version
    });
    
  } catch (err) {
    failSpinner('获取资源信息失败');
    
    if (err instanceof FreelogError) {
      error(err.toString());
    } else {
      error(err.message);
    }
    
    logError(err);
    process.exit(1);
  }
}

/**
 * 同步作品信息
 */
async function syncWorkInfo(options) {
  const config = readConfig(process.cwd(), true);
  
  if (!config.resource || !config.resource.resourceId) {
    error('配置文件中缺少资源ID');
    process.exit(1);
  }
  
  const version = options.version || config.version || 'latest';
  
  title(`同步作品信息 (${version})`);
  
  const spinner = startSpinner('正在同步...');
  
  try {
    const resourceInfo = await getResource(config.resource.resourceId);
    
    config.resource = {
      ...config.resource,
      resourceName: resourceInfo.resourceName,
      resourceType: resourceInfo.resourceType,
      coverImages: resourceInfo.coverImages || [],
      description: resourceInfo.description || '',
      tags: resourceInfo.tags || []
    };
    
    updateConfig(config);
    
    succeedSpinner('作品信息同步成功');
    success(`资源: ${resourceInfo.resourceName}`);
    
    logOperation('sync_work_success', { resourceId: config.resource.resourceId });
    
  } catch (err) {
    failSpinner('同步失败');
    error(err.message);
    logError(err);
    process.exit(1);
  }
}

/**
 * 同步所有信息
 */
async function syncAllInfo(options) {
  const config = readConfig(process.cwd(), true);
  
  if (!config.resource || !config.resource.resourceId) {
    error('配置文件中缺少资源ID');
    process.exit(1);
  }
  
  const version = options.version || 'latest';
  
  title(`同步所有信息 (${version})`);
  
  const spinner = startSpinner('正在同步...');
  
  try {
    const resourceInfo = await getResource(config.resource.resourceId);
    const versionInfo = await getResourceVersion(config.resource.resourceId, version);
    
    const updates = {
      version: versionInfo.version,
      resource: {
        ...config.resource,
        resourceName: resourceInfo.resourceName,
        resourceType: resourceInfo.resourceType,
        coverImages: resourceInfo.coverImages || [],
        description: resourceInfo.description || '',
        tags: resourceInfo.tags || []
      },
      properties: versionInfo.properties || config.properties || [],
      customOptions: versionInfo.customOptions || config.customOptions || [],
      changelog: {
        ...config.changelog,
        ...versionInfo.changelog
      },
      dependencies: versionInfo.dependencies || config.dependencies || []
    };
    
    if (options.force) {
      writeConfig({ ...config, ...updates });
    } else {
      updateConfig(updates);
    }
    
    succeedSpinner('所有信息同步成功');
    success(`版本: ${versionInfo.version}`);
    success(`依赖: ${updates.dependencies.length} 个`);
    success(`属性: ${updates.properties.length} 个`);
    
    logOperation('sync_all_success', {
      resourceId: config.resource.resourceId,
      version: versionInfo.version
    });
    
  } catch (err) {
    failSpinner('同步失败');
    error(err.message);
    logError(err);
    process.exit(1);
  }
}

/**
 * 同步部分信息
 */
async function syncPartialInfo(options) {
  const config = readConfig(process.cwd(), true);
  
  if (!config.resource || !config.resource.resourceId) {
    error('配置文件中缺少资源ID');
    process.exit(1);
  }
  
  const version = options.version || config.version || 'latest';
  
  title(`同步部分信息 (${version})`);
  
  const spinner = startSpinner('正在同步...');
  
  try {
    const versionInfo = await getResourceVersion(config.resource.resourceId, version);
    const updates = {};
    
    if (options.props) {
      updates.properties = versionInfo.properties || [];
      info('✓ 属性信息');
    }
    
    if (options.config) {
      updates.customOptions = versionInfo.customOptions || [];
      info('✓ 配置信息');
    }
    
    if (options.changelog) {
      updates.changelog = {
        ...config.changelog,
        ...versionInfo.changelog
      };
      info('✓ 更新说明');
    }
    
    updateConfig(updates);
    
    succeedSpinner('信息同步成功');
    
    logOperation('sync_partial_success', {
      resourceId: config.resource.resourceId,
      version,
      fields: Object.keys(updates)
    });
    
  } catch (err) {
    failSpinner('同步失败');
    error(err.message);
    logError(err);
    process.exit(1);
  }
}

/**
 * 交互式同步
 */
async function interactiveSync(options) {
  const config = readConfig(process.cwd(), true);
  
  if (!config.resource || !config.resource.resourceId) {
    error('配置文件中缺少资源ID');
    process.exit(1);
  }
  
  title('同步配置');
  
  const { syncOptions } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'syncOptions',
      message: '请选择要同步的内容:',
      choices: [
        { name: '作品信息', value: 'work', checked: true },
        { name: '属性信息', value: 'props', checked: true },
        { name: '配置信息', value: 'config', checked: true },
        { name: '更新说明', value: 'changelog', checked: true },
        { name: '依赖列表', value: 'dependencies', checked: false }
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
  
  const spinner = startSpinner('正在同步...');
  
  try {
    const versionInfo = await getResourceVersion(config.resource.resourceId, version);
    const updates = {};
    
    if (syncOptions.includes('work')) {
      const resourceInfo = await getResource(config.resource.resourceId);
      updates.resource = {
        ...config.resource,
        resourceName: resourceInfo.resourceName,
        resourceType: resourceInfo.resourceType,
        coverImages: resourceInfo.coverImages || [],
        description: resourceInfo.description || '',
        tags: resourceInfo.tags || []
      };
    }
    
    if (syncOptions.includes('props')) {
      updates.properties = versionInfo.properties || [];
    }
    
    if (syncOptions.includes('config')) {
      updates.customOptions = versionInfo.customOptions || [];
    }
    
    if (syncOptions.includes('changelog')) {
      updates.changelog = {
        ...config.changelog,
        ...versionInfo.changelog
      };
    }
    
    if (syncOptions.includes('dependencies')) {
      updates.dependencies = versionInfo.dependencies || [];
    }
    
    updateConfig(updates);
    
    succeedSpinner('同步成功');
    success(`已同步 ${syncOptions.length} 项内容`);
    
    logOperation('interactive_sync_success', {
      resourceId: config.resource.resourceId,
      version,
      options: syncOptions
    });
    
  } catch (err) {
    failSpinner('同步失败');
    error(err.message);
    logError(err);
    process.exit(1);
  }
}

module.exports = executeSync;

