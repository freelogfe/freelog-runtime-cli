/**
 * 信息同步命令
 */

const inquirer = require('inquirer');
const { requireAuth } = require('../core/auth');
const { readConfig, writeConfig, updateConfig } = require('../core/config');
const { getResource, getResourceVersion } = require('../core/api');
const { logOperation, logError } = require('../core/logger');
const { startSpinner, spinner.succeed, spinner.fail } = require('../utils/spinner');
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
      console.log(chalk.red('✖ ') + err.toString());
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
    console.log(chalk.red('✖ ') + `执行同步命令失败: ${err.message}`);
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
  console.log(chalk.blue('ℹ ') + `资源: ${parsed.value}`);
  if (parsed.version) {
    console.log(chalk.blue('ℹ ') + `版本: ${parsed.version}`);
  }
  
  let spinner = ora('正在获取资源信息...').start();
  
  try {
    // 获取资源信息
    const resourceInfoResponse = await apiClient.get(`/v2/resources/${parsed.value}`);
    
    if (!resourceInfoResponse || !resourceInfoResponse.data || !resourceInfoResponse.data.data) {
      throw new Error('资源信息获取失败');
    }
    
    const resource = resourceInfoResponse.data.data;
    
    // 获取版本信息
    const version = parsed.version || 'latest';
    const versionInfoResponse = await apiClient.get(`/v2/resources/${resource.resourceId || resource._id}/versions/${version}`);
    
    if (!versionInfoResponse || !versionInfoResponse.data || !versionInfoResponse.data.data) {
      throw new Error('版本信息获取失败');
    }
    
    const versionData = versionInfoResponse.data.data;
    
    spinner.succeed('资源信息获取成功');
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
        console.log(chalk.yellow('⚠ ') + '配置文件已存在');
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: '是否覆盖现有配置?',
            default: false
          }
        ]);
        
        if (!overwrite) {
          console.log(chalk.blue('ℹ ') + '已取消同步');
          return;
        }
      }
    } catch (err) {
      // 配置文件不存在，继续
    }
    
    // 写入配置文件
    writeConfig(config);
    
    console.log(chalk.green('✔ ') + '配置文件创建成功!');
    console.log(chalk.green('✔ ') + `资源: ${config.name}`);
    console.log(chalk.green('✔ ') + `workId: ${config.workId}`);
    console.log(chalk.green('✔ ') + `版本: ${config.version}`);
    console.log(chalk.blue('ℹ ') + '配置文件已保存到: freelog.json');
    
    logOperation('initialize_sync_success', {
      workId: config.workId,
      version: config.version
    });
    
  } catch (err) {
    if (spinner) {
      spinner.fail('获取资源信息失败');
      spinner = null;
    }
    
    if (err instanceof FreelogError) {
      console.log(chalk.red('✖ ') + err.toString());
    } else {
      console.log(chalk.red('✖ ') + `同步失败: ${err.message}`);
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
    console.log(chalk.red('✖ ') + '配置文件中缺少 workId');
    process.exit(1);
  }
  
  title('同步作品信息');
  
  let spinner = ora('正在同步...').start();
  
  try {
    const resourceInfoResponse = await apiClient.get(`/v2/resources/${config.workId}`);
    
    if (!resourceInfoResponse || !resourceInfoResponse.data || !resourceInfoResponse.data.data) {
      throw new Error('资源信息获取失败');
    }
    
    const resource = resourceInfoResponse.data.data;
    
    // 更新基本信息
    config.name = resource.resourceName;
    config.description = resource.intro || config.description;
    
    updateConfig(config);
    
    spinner.succeed('作品信息同步成功');
    spinner = null;
    console.log(chalk.green('✔ ') + `资源: ${config.name}`);
    console.log(chalk.green('✔ ') + `workId: ${config.workId}`);
    
    logOperation('sync_work_success', { workId: config.workId });
    
  } catch (err) {
    if (spinner) {
      spinner.fail('同步失败');
      spinner = null;
    }
    console.log(chalk.red('✖ ') + `同步失败: ${err.message}`);
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
    console.log(chalk.red('✖ ') + '配置文件中缺少 workId');
    process.exit(1);
  }
  
  const version = options.version || 'latest';
  
  title(`同步所有信息 (版本: ${version})`);
  
  let spinner = ora('正在同步...').start();
  
  try {
    const resourceInfoResponse = await apiClient.get(`/v2/resources/${config.workId}`);
    const versionInfoResponse = await apiClient.get(`/v2/resources/${config.workId}/versions/${version}`);
    
    if (!resourceInfoResponse || !resourceInfoResponse.data || !resourceInfoResponse.data.data || !versionInfoResponse || !versionInfoResponse.data || !versionInfoResponse.data.data) {
      throw new Error('信息获取失败');
    }
    
    const resource = resourceInfoResponse.data.data;
    const versionData = versionInfoResponse.data.data;
    
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
    
    spinner.succeed('所有信息同步成功');
    spinner = null;
    console.log(chalk.green('✔ ') + `版本: ${updates.version}`);
    console.log(chalk.green('✔ ') + `依赖: ${updates.dependencies.length} 个`);
    console.log(chalk.green('✔ ') + `自定义属性: ${updates.customPropertyDescriptors.length} 个`);
    
    logOperation('sync_all_success', {
      workId: config.workId,
      version: updates.version
    });
    
  } catch (err) {
    if (spinner) {
      spinner.fail('同步失败');
      spinner = null;
    }
    console.log(chalk.red('✖ ') + `同步失败: ${err.message}`);
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
    console.log(chalk.red('✖ ') + '配置文件中缺少 workId');
    process.exit(1);
  }
  
  const version = options.version || config.version || 'latest';
  
  title(`同步部分信息 (版本: ${version})`);
  
  let spinner = ora('正在同步...').start();
  
  try {
    const versionInfoResponse = await apiClient.get(`/v2/resources/${config.workId}/versions/${version}`);
    
    if (!versionInfoResponse || !versionInfoResponse.data || !versionInfoResponse.data.data) {
      throw new Error('版本信息获取失败');
    }
    
    const versionData = versionInfoResponse.data.data;
    const updates = {};
    
    if (options.props) {
      updates.customPropertyDescriptors = versionData.customPropertyDescriptors || [];
      updates.inputAttrs = versionData.customPropertyDescriptors || [];
      console.log(chalk.blue('ℹ ') + '✓ 自定义属性');
    }
    
    if (options.config) {
      updates.dependencies = versionData.dependencies || [];
      updates.baseUpcastResources = versionData.baseUpcastResources || [];
      updates.resolveResources = versionData.resolveResources || [];
      console.log(chalk.blue('ℹ ') + '✓ 依赖配置');
    }
    
    if (options.changelog) {
      updates.description = versionData.description || config.description;
      console.log(chalk.blue('ℹ ') + '✓ 描述信息');
    }
    
    updateConfig(updates);
    
    spinner.succeed('信息同步成功');
    spinner = null;
    
    logOperation('sync_partial_success', {
      workId: config.workId,
      version,
      fields: Object.keys(updates)
    });
    
  } catch (err) {
    if (spinner) {
      spinner.fail('同步失败');
      spinner = null;
    }
    console.log(chalk.red('✖ ') + `同步失败: ${err.message}`);
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
    console.log(chalk.red('✖ ') + '配置文件中缺少 workId');
    console.log(chalk.red('✖ ') + '请先执行: freelog-cli sync <resourceIdOrName>');
    process.exit(1);
  }
  
  title('同步配置');
  console.log(chalk.blue('ℹ ') + `当前资源: ${config.name || config.workId}`);
  
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
    console.log(chalk.blue('ℹ ') + '未选择任何同步内容');
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
  
  let spinner = ora('正在同步...').start();
  
  try {
    const versionInfoResponse = await apiClient.get(`/v2/resources/${config.workId}/versions/${version}`);
    
    if (!versionInfoResponse || !versionInfoResponse.data || !versionInfoResponse.data.data) {
      throw new Error('版本信息获取失败');
    }
    
    const versionData = versionInfoResponse.data.data;
    const updates = {};
    
    if (syncOptions.includes('work')) {
      const resourceInfoResponse = await apiClient.get(`/v2/resources/${config.workId}`);
      if (resourceInfoResponse && resourceInfoResponse.data && resourceInfoResponse.data.data) {
        updates.name = resourceInfoResponse.data.data.resourceName;
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
    
    spinner.succeed('同步成功');
    spinner = null;
    console.log(chalk.green('✔ ') + `已同步 ${syncOptions.length} 项内容`);
    console.log(chalk.green('✔ ') + `版本: ${updates.version}`);
    
    logOperation('interactive_sync_success', {
      workId: config.workId,
      version: updates.version,
      options: syncOptions
    });
    
  } catch (err) {
    if (spinner) {
      spinner.fail('同步失败');
      spinner = null;
    }
    console.log(chalk.red('✖ ') + `同步失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

module.exports = executeSync;

