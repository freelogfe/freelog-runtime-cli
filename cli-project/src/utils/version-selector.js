/**
 * 版本选择工具
 */

const inquirer = require('inquirer');
const { getResourceVersionList } = require('../core/api');
const { startSpinner, succeedSpinner, failSpinner } = require('./spinner');
const { error, info } = require('./output');

/**
 * 交互式选择版本
 * @param {string} resourceId - 资源ID
 * @param {string} resourceName - 资源名称（用于显示）
 * @returns {Promise<string|null>} 选择的版本号，如果取消则返回 null
 */
async function selectVersion(resourceId, resourceName) {
  let spinner = startSpinner('正在获取版本列表...');
  
  try {
    // 获取版本列表
    const result = await getResourceVersionList(resourceId, {
      projection: 'version,createDate,description'
    });
    
    if (!result || !result.data || !result.data.dataList) {
      throw new Error('版本列表获取失败');
    }
    
    const versions = result.data.dataList;
    
    if (versions.length === 0) {
      if (spinner) {
        failSpinner('未找到可用版本');
        spinner = null;
      }
      error('该资源没有可用版本');
      return null;
    }
    
    succeedSpinner(`找到 ${versions.length} 个版本`);
    spinner = null;
    
    // 构建版本选择列表
    const choices = versions.map((v, index) => {
      const isLatest = index === 0;
      const date = v.createDate ? new Date(v.createDate).toLocaleDateString('zh-CN') : '';
      const desc = v.description || '';
      
      let name = `${v.version}`;
      if (isLatest) {
        name += ' (最新版本)';
      }
      if (date) {
        name += ` - ${date}`;
      }
      if (desc && desc.length > 0) {
        const shortDesc = desc.length > 50 ? desc.substring(0, 50) + '...' : desc;
        name += ` - ${shortDesc}`;
      }
      
      return {
        name,
        value: v.version,
        short: v.version
      };
    });
    
    // 添加取消选项
    choices.push({
      name: '取消选择',
      value: null,
      short: '取消'
    });
    
    // 提示用户选择
    info(`资源: ${resourceName}`);
    console.log();
    
    const { selectedVersion } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedVersion',
        message: '请选择版本:',
        choices,
        pageSize: 15
      }
    ]);
    
    return selectedVersion;
    
  } catch (err) {
    if (spinner) {
      failSpinner('获取版本列表失败');
      spinner = null;
    }
    error(`错误: ${err.message}`);
    return null;
  }
}

/**
 * 格式化版本显示信息
 * @param {Object} version - 版本对象
 * @returns {string} 格式化后的版本信息
 */
function formatVersionDisplay(version) {
  let display = version.version;
  
  if (version.createDate) {
    const date = new Date(version.createDate).toLocaleDateString('zh-CN');
    display += ` (${date})`;
  }
  
  if (version.description) {
    const desc = version.description.length > 30 
      ? version.description.substring(0, 30) + '...' 
      : version.description;
    display += ` - ${desc}`;
  }
  
  return display;
}

module.exports = {
  selectVersion,
  formatVersionDisplay
};

