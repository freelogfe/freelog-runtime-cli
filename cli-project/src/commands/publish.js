/**
 * 发布命令
 * 整合了旧版发布逻辑，使用正确的 Freelog API
 */

const inquirer = require('inquirer');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const FormData = require('form-data');
const { requireAuth } = require('../core/auth');
const { readConfig, validateConfig } = require('../core/config');
const { logOperation, logError } = require('../core/logger');
const { startSpinner, succeedSpinner, failSpinner } = require('../utils/spinner');
const { success, error, warning, info, printVersionChange, printValidationResult } = require('../utils/output');
const { incrementVersion, validateVersion } = require('../utils/validator');
const { validateFileSize, validateFileType, formatFileSize } = require('../utils/file');
const { FreelogError } = require('../core/errors');
const fs = require('fs-extra');
const os = require('os');

/**
 * 执行发布命令
 * @param {Object} options - 命令选项
 */
async function executePublish(options) {
  try {
    logOperation('publish', options);
    
    // 1. 检查登录状态
    let auth;
    try {
      auth = requireAuth();
    } catch (err) {
      error(err.toString());
      process.exit(1);
    }
    
    // 2. 如果指定了用户类型，检查是否匹配
    if (options.globalUser && auth.scope !== 'global') {
      warning('当前使用工作空间登录，但指定了全局用户发布');
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: '是否继续?',
          default: false
        }
      ]);
      if (!proceed) {
        process.exit(0);
      }
    }
    
    if (options.workspaceUser && auth.scope !== 'workspace') {
      warning('当前使用全局登录，但指定了工作空间用户发布');
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: '是否继续?',
          default: false
        }
      ]);
      if (!proceed) {
        process.exit(0);
      }
    }
    
    // 3. 读取配置文件
    const configPath = options.config || path.join(process.cwd(), 'freelog.json');
    let config;
    
    try {
      config = readConfig(path.dirname(configPath), true);
    } catch (err) {
      error('找不到配置文件 freelog.json');
      error('请先执行 freelog-cli sync 初始化配置');
      process.exit(1);
    }
    
    // 4. 验证配置文件
    const validation = validateConfig(config);
    printValidationResult(validation);
    
    if (!validation.valid) {
      error('配置文件验证失败，请修复后重试');
      process.exit(1);
    }
    
    // 5. 处理版本号
    let newVersion = config.version;
    
    if (options.major || options.minor || options.patch) {
      const type = options.major ? 'major' : options.minor ? 'minor' : 'patch';
      newVersion = incrementVersion(config.version, type);
      printVersionChange(config.version, newVersion);
      
      // 更新配置文件中的版本号
      config.version = newVersion;
    } else {
      // 交互式询问版本号
      const { versionAction } = await inquirer.prompt([
        {
          type: 'list',
          name: 'versionAction',
          message: '请选择版本号操作:',
          choices: [
            { name: `保持当前版本 (${config.version})`, value: 'keep' },
            { name: '补丁版本递增 (patch)', value: 'patch' },
            { name: '次版本递增 (minor)', value: 'minor' },
            { name: '主版本递增 (major)', value: 'major' },
            { name: '手动输入版本号', value: 'manual' }
          ]
        }
      ]);
      
      if (versionAction === 'manual') {
        const { manualVersion } = await inquirer.prompt([
          {
            type: 'input',
            name: 'manualVersion',
            message: '请输入版本号 (格式: x.y.z):',
            validate: input => {
              try {
                validateVersion(input);
                return true;
              } catch {
                return '无效的版本号格式';
              }
            }
          }
        ]);
        newVersion = manualVersion;
      } else if (versionAction !== 'keep') {
        newVersion = incrementVersion(config.version, versionAction);
      }
      
      if (newVersion !== config.version) {
        printVersionChange(config.version, newVersion);
        config.version = newVersion;
      }
    }
    
    // 6. 获取更新说明
    let changeMessage = options.message;
    if (!changeMessage) {
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: '请输入版本更新说明:',
          default: '版本更新'
        }
      ]);
      changeMessage = message;
    }
    
    // 更新 changelog
    if (!config.changelog) {
      config.changelog = {};
    }
    config.changelog[newVersion] = changeMessage;
    
    // 7. 准备发布文件（使用 AdmZip 压缩）
    let publishFilePath = options.packagePath || options.file;
    let needCleanup = false;
    
    if (!publishFilePath) {
      // 根据配置文件确定构建目录
      const buildDir = config.publishPath || config.local?.buildDir || 'dist';
      const buildPath = path.resolve(process.cwd(), buildDir);
      
      if (!fs.existsSync(buildPath)) {
        error(`构建目录不存在: ${buildPath}`);
        error('请先执行构建命令');
        process.exit(1);
      }
      
      // 压缩构建目录
      let spinner = startSpinner('正在打包文件...');
      
      try {
        // 创建临时文件目录
        const tempDir = path.join(os.homedir(), '.freelog-cli', 'temp');
        fs.ensureDirSync(tempDir);
        
        // 使用 AdmZip 压缩
        const zip = new AdmZip();
        const files = fs.readdirSync(buildPath);
        
        files.forEach(file => {
          const filePath = path.join(buildPath, file);
          const stats = fs.statSync(filePath);
          
          if (stats.isDirectory()) {
            zip.addLocalFolder(filePath, file);
          } else {
            zip.addLocalFile(filePath);
          }
        });
        
        // 生成压缩文件
        const zipFileName = `${config.name || 'resource'}.zip`;
        publishFilePath = path.join(tempDir, zipFileName);
        zip.writeZip(publishFilePath);
        
        succeedSpinner('文件打包完成');
        spinner = null;
        needCleanup = true;
        
        info(`打包路径: ${buildPath}`);
        info(`压缩文件: ${zipFileName}`);
      } catch (err) {
        if (spinner) {
          failSpinner('文件打包失败');
          spinner = null;
        }
        throw err;
      }
    }
    
    // 8. 验证文件
    try {
      validateFileType(publishFilePath);
      validateFileSize(publishFilePath);
      const fileSize = formatFileSize(fs.statSync(publishFilePath).size);
      success(`文件大小: ${fileSize}`);
    } catch (err) {
      error(err.message);
      process.exit(1);
    }
    
    // 9. 上传文件到 Freelog
    let uploadSpinner = startSpinner('正在上传文件...');
    let fileSha1;
    
    try {
      // 准备 FormData
      const formData = new FormData();
      const fileStream = fs.createReadStream(publishFilePath);
      const fileName = path.basename(publishFilePath);
      
      formData.append('file', fileStream);
      
      // 获取表单长度
      const contentLength = await new Promise((resolve, reject) => {
        formData.getLength((err, length) => {
          if (err) reject(err);
          else resolve(length);
        });
      });
      
      info(`上传文件大小: ${formatFileSize(contentLength)}`);
      
      // 上传到 Freelog
      const uploadResponse = await axios({
        url: 'http://api.testfreelog.com/v2/storages/files/upload',
        method: 'POST',
        data: formData,
        headers: {
          ...formData.getHeaders(),
          'Content-Length': contentLength,
          'authorization': auth.authorization || auth.token
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      
      // 检查上传结果
      if (uploadResponse.data.errCode) {
        throw new Error(uploadResponse.data.msg || '文件上传失败');
      }
      
      fileSha1 = uploadResponse.data.data.sha1;
      succeedSpinner('文件上传完成');
      uploadSpinner = null;
      
      info(`文件SHA1: ${fileSha1}`);
      
    } catch (err) {
      if (uploadSpinner) {
        failSpinner('文件上传失败');
        uploadSpinner = null;
      }
      throw new Error(`上传失败: ${err.message}`);
    }
    
    // 10. 发布作品或草稿
    let publishSpinner = startSpinner(options.draft ? '正在保存草稿...' : '正在发布作品...');
    
    try {
      const fileName = path.basename(publishFilePath);
      
      // 检查 workId
      if (!config.workId) {
        throw new Error('workId 不存在，请检查 freelog.json 配置文件');
      }
      
      let publishData;
      let apiUrl;
      
      if (options.draft) {
        // 草稿数据格式
        publishData = {
          draftData: {
            versionInput: newVersion,
            selectedFileInfo: {
              name: fileName,
              sha1: fileSha1,
              from: '上个版本'
            },
            additionalProperties: [],
            customProperties: [],
            customConfigurations: [],
            directDependencies: config.dependencies || [],
            baseUpcastResources: config.baseUpcastResources || [],
            descriptionEditorInput: config.description || changeMessage
          }
        };
        
        // 处理自定义属性
        if (config.customPropertyDescriptors && Array.isArray(config.customPropertyDescriptors)) {
          // 分离 customProperties 和 customConfigurations
          publishData.draftData.customProperties = config.customPropertyDescriptors
            .filter(item => item.type === 'readonlyText')
            .map(item => ({
              ...item,
              value: item.defaultValue,
              description: item.remark
            }));
          
          publishData.draftData.customConfigurations = config.customPropertyDescriptors
            .filter(item => item.type !== 'readonlyText')
            .map(item => ({
              ...item,
              input: item.defaultValue,
              description: item.remark,
              select: item.candidateItems || [],
              type: item.type === 'editableText' ? 'input' : item.type
            }));
        }
        
        apiUrl = `https://api.testfreelog.com/v2/resources/${config.workId}/versions/drafts`;
        
      } else {
        // 正式发布数据格式
        publishData = {
          version: newVersion,
          filename: fileName,
          fileSha1: fileSha1,
          description: config.description || changeMessage,
          baseUpcastResources: config.baseUpcastResources || [],
          customPropertyDescriptors: config.customPropertyDescriptors || [],
          dependencies: config.dependencies || [],
          resolveResources: config.resolveResources || []
        };
        
        apiUrl = `http://api.testfreelog.com/v2/resources/${config.workId}/versions`;
      }
      
      // 发送发布请求
      const publishResponse = await axios({
        url: apiUrl,
        method: 'POST',
        data: publishData,
        headers: {
          'Content-Type': 'application/json',
          'authorization': auth.authorization || auth.token
        }
      });
      
      // 检查发布结果
      if (publishResponse.data.errCode) {
        throw new Error(publishResponse.data.msg || '发布失败');
      }
      
      succeedSpinner(options.draft ? '草稿保存成功!' : '作品发布成功!');
      publishSpinner = null;
      
      // 显示成功信息
      success(`版本: ${newVersion}`);
      success(`资源ID: ${config.workId}`);
      
      if (!options.draft) {
        success(`文件SHA1: ${fileSha1}`);
        info(`更新说明: ${changeMessage}`);
      }
      
      logOperation('publish_success', {
        version: newVersion,
        draft: options.draft,
        workId: config.workId,
        sha1: fileSha1
      });
      
    } catch (err) {
      if (publishSpinner) {
        failSpinner(options.draft ? '草稿保存失败' : '发布失败');
        publishSpinner = null;
      }
      
      if (err.response?.data?.msg) {
        error(`API 错误: ${err.response.data.msg}`);
      } else {
        error(`发布失败: ${err.message}`);
      }
      
      logError(err, { version: newVersion, draft: options.draft });
      process.exit(1);
    }
    
    // 11. 清理临时文件
    if (needCleanup && publishFilePath) {
      try {
        await fs.remove(publishFilePath);
        info('已清理临时文件');
      } catch (cleanupErr) {
        // 忽略清理错误，不影响发布成功
      }
    }
    
  } catch (err) {
    error(`执行发布命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

module.exports = executePublish;

