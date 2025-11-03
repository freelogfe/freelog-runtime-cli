/**
 * 项目初始化命令
 * 整合了模板安装逻辑
 */

const inquirer = require('inquirer');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { logOperation, logError, logger } = require('../core/logger');
const { startSpinner, succeedSpinner, failSpinner } = require('../utils/spinner');
const { success, error, info } = require('../utils/output');

// 常量定义
const TYPE_THEME = 'theme';
const TYPE_WIDGET = 'widget';
const TYPE_PACKAGE = 'package';
const TEMPLATE_TYPE_NORMAL = 'normal';
const TEMPLATE_TYPE_CUSTOM = 'custom';

/**
 * 获取模板列表（从配置获取）
 */
function getProjectTemplate() {
  return Promise.resolve([
    {
      name: 'freelog主题-vite-react模板',
      npmName: '@freelog-cli/template-vite-react',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      buildPath: 'dist'
    },
    {
      name: 'freelog主题-vite-react-ts模板',
      npmName: '@freelog-cli/template-vite-react-ts',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      buildPath: 'dist'
    },
    {
      name: 'freelog主题-vite-vue模板',
      npmName: '@freelog-cli/template-vite-vue',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      buildPath: 'dist'
    },
    {
      name: 'freelog主题-vite-vue-ts模板',
      npmName: '@freelog-cli/template-vite-vue-ts',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      buildPath: 'dist'
    },
    {
      name: 'freelog主题-webpack-react模板',
      npmName: '@freelog-cli/template-webpack-react',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      buildPath: 'dist'
    },
    {
      name: 'freelog主题-webpack-react-ts模板',
      npmName: '@freelog-cli/template-webpack-react-ts',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      buildPath: 'dist'
    },
    {
      name: 'freelog主题-webpack-vue模板',
      npmName: '@freelog-cli/template-webpack-vue',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      buildPath: 'dist'
    },
    {
      name: 'freelog主题-webpack-vue-ts模板',
      npmName: '@freelog-cli/template-webpack-vue-ts',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      buildPath: 'dist'
    },
    {
      name: 'freelog插件-vite-react模板',
      npmName: '@freelog-cli/template-widget-vite-react',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['widget'],
      buildPath: 'dist'
    },
    {
      name: 'freelog插件-vite-vue模板',
      npmName: '@freelog-cli/template-widget-vite-vue',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['widget'],
      buildPath: 'dist'
    },
    {
      name: 'freelog前端库-js-模板',
      npmName: '@freelog-cli/template-package-js',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['package'],
      buildPath: 'dist'
    },
    {
      name: 'freelog前端库-react-模板',
      npmName: '@freelog-cli/template-package-react',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['package'],
      buildPath: 'dist'
    },
    {
      name: 'freelog前端库-vue-模板',
      npmName: '@freelog-cli/template-package-vue',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['package'],
      buildPath: 'dist'
    }
  ]);
}

/**
 * 执行初始化命令
 * @param {string} projectName - 项目名称
 * @param {Object} options - 命令选项
 */
async function executeInit(projectName, options) {
  try {
    logOperation('init', { projectName, options });
    
    // 设置目标路径
    const targetPath = process.cwd();
    
    // 1. 准备工作：检查目录和获取配置
    const prepareResult = await prepare(targetPath, options);
    if (!prepareResult) {
      info('创建项目终止');
      return;
    }
    
    const { templateList, projectInfo } = prepareResult;
    
    // 2. 下载/选择模板
    const template = await downloadTemplate(templateList, projectInfo, options);
    
    // 3. 安装模板
    if (template.type === TEMPLATE_TYPE_NORMAL) {
      await installTemplate(template, projectInfo, targetPath, options);
    } else if (template.type === TEMPLATE_TYPE_CUSTOM) {
      await installCustomTemplate(template, projectInfo, targetPath, options);
    } else {
      throw new Error('未知的模板类型！');
    }
    
    // 4. 显示后续步骤
    console.log();
    success('✨ 项目创建成功！');
    console.log();
    info('请执行以下命令开始开发:');
    console.log();
    info(`  cd ${projectInfo.projectName}`);
    info('  npm install    # 安装依赖');
    info('  npm run dev    # 启动开发服务器');
    console.log();
    info('更多命令:');
    info('  freelog-cli login      # 登录');
    info('  freelog-cli publish    # 发布作品');
    info('  freelog-cli --help     # 查看帮助');
    console.log();
    
    logOperation('init_success', { projectInfo, template: template.name });
    
  } catch (err) {
    error(`执行初始化命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

/**
 * 准备工作：检查目录、获取项目信息、获取模板列表
 */
async function prepare(targetPath, options) {
  // 1. 检查目录是否为空
  let fileList = fs.readdirSync(targetPath);
  fileList = fileList.filter(file => ['node_modules', '.git', '.DS_Store'].indexOf(file) < 0);
  
  let continueWhenDirNotEmpty = true;
  if (fileList && fileList.length > 0) {
    continueWhenDirNotEmpty = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: '当前文件夹不为空，是否继续创建？',
      default: false
    }]).then(ans => ans.confirm);
  }
  
  if (!continueWhenDirNotEmpty) {
    return null;
  }
  
  // 2. 是否清空目录
  if (options.force) {
    const confirmEmptyDir = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: '是否确认清空当前目录下的文件？',
      default: false
    }]).then(ans => ans.confirm);
    
    if (confirmEmptyDir) {
      fs.emptyDirSync(targetPath);
    }
  }
  
  // 3. 选择初始化类型
  const initType = await inquirer.prompt([{
    type: 'list',
    name: 'type',
    choices: [
      { name: '主题', value: TYPE_THEME },
      { name: '插件', value: TYPE_WIDGET },
      { name: '前端库', value: TYPE_PACKAGE }
    ],
    message: '请选择初始化类型',
    default: TYPE_THEME
  }]).then(ans => ans.type);
  
  // 4. 获取模板列表
  const allTemplates = await getProjectTemplate();
  const templateList = allTemplates.filter(item => item.tag.includes(initType));
  
  if (!templateList || templateList.length === 0) {
    throw new Error('模板列表获取失败');
  }
  
  // 5. 获取项目名称
  let projectName = '';
  while (!projectName) {
    const namePrompt = initType === TYPE_THEME ? '请输入主题名称' :
      initType === TYPE_WIDGET ? '请输入插件名称' :
        '请输入前端库名称';
    
    projectName = await inquirer.prompt([{
      type: 'input',
      name: 'name',
      message: namePrompt,
      validate: input => {
        if (!input.trim()) {
          return '名称不能为空';
        }
        if (!/^[a-zA-Z0-9-_]+$/.test(input)) {
          return '名称只能包含字母、数字、连字符和下划线';
        }
        return true;
      }
    }]).then(ans => ans.name);
  }
  
  // 6. 获取版本号
  const version = await inquirer.prompt([{
    type: 'input',
    name: 'version',
    message: '请输入版本号',
    default: '1.0.0'
  }]).then(ans => ans.version);
  
  // 7. 如果是前端库，获取命名空间
  let nameSpace = '';
  if (initType === TYPE_PACKAGE) {
    nameSpace = await inquirer.prompt([{
      type: 'input',
      name: 'nameSpace',
      message: '请输入库的 nameSpace',
      default: ''
    }]).then(ans => {
      let ns = ans.nameSpace;
      if (ns && ns.indexOf('freelogLibrary.') !== 0) {
        ns = 'freelogLibrary.' + ns;
      }
      return ns;
    });
  }
  
  // 8. 返回准备结果
  return {
    templateList,
    projectInfo: {
      name: projectName,
      projectName,
      className: formatClassName(projectName),
      version,
      initType,
      nameSpace
    }
  };
}

/**
 * 下载/选择模板
 */
async function downloadTemplate(templateList) {
  // 1. 用户选择模板
  const templateName = await inquirer.prompt([{
    type: 'list',
    name: 'template',
    choices: templateList.map(item => ({
      value: item.npmName,
      name: item.name
    })),
    message: '请选择项目模板'
  }]).then(ans => ans.template);
  
  const selectedTemplate = templateList.find(item => item.npmName === templateName);
  logger.info('selected template', selectedTemplate.name);
  
  // 2. 确定缓存目录
  const cliHome = path.join(os.homedir(), '.freelog-cli');
  const templateCacheDir = path.join(cliHome, 'template');
  fs.ensureDirSync(templateCacheDir);
  
  // 3. 模板路径
  const templateDir = path.join(templateCacheDir, selectedTemplate.npmName, selectedTemplate.version);
  
  // 4. 检查模板是否已存在
  if (fs.existsSync(templateDir)) {
    info(`模板已存在: ${selectedTemplate.npmName}@${selectedTemplate.version}`);
    info(`模板路径: ${templateDir}`);
  } else {
    // 5. 下载模板（这里简化处理，实际应该从 npm 下载）
    startSpinner('正在准备模板...');
    
    try {
      fs.ensureDirSync(templateDir);
      
      // 这里应该从 npm 下载模板包
      // 简化处理：从本地 templates 目录复制
      const localTemplatePath = path.join(__dirname, '../../../templates', selectedTemplate.npmName.split('/').pop());
      
      if (fs.existsSync(localTemplatePath)) {
        await fs.copy(localTemplatePath, templateDir);
        succeedSpinner('模板准备成功');
      } else {
        failSpinner('模板不存在');
        throw new Error(`本地模板不存在: ${localTemplatePath}`);
      }
    } catch (err) {
      failSpinner('模板准备失败');
      throw err;
    }
  }
  
  // 6. 返回模板信息
  const templatePath = path.join(templateDir, 'template');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`模板目录不存在: ${templatePath}`);
  }
  
  return {
    ...selectedTemplate,
    path: templatePath,
    sourcePath: templateDir
  };
}

/**
 * 安装普通模板
 */
async function installTemplate(template, projectInfo, targetPath) {
  startSpinner('正在安装模板...');
  
  try {
    // 1. 复制模板文件
    const sourceDir = template.path;
    const targetDir = path.join(targetPath, projectInfo.projectName);
    
    fs.ensureDirSync(sourceDir);
    fs.ensureDirSync(targetDir);
    
    // 过滤不需要复制的文件
    await fs.copy(sourceDir, targetDir, {
      filter: (src) => {
        const relativePath = path.relative(sourceDir, src);
        // 过滤规则
        if (relativePath.includes('node_modules')) return false;
        if (relativePath.includes('.git')) return false;
        if (relativePath.includes('.DS_Store')) return false;
        return true;
      }
    });
    
    succeedSpinner('模板安装成功');
    
    // 2. 创建 freelog.json 配置文件
    const configPath = path.join(targetDir, 'freelog.json');
    if (!fs.existsSync(configPath)) {
      const config = {
        version: projectInfo.version || '1.0.0',
        type: 'object',
        local: {
          buildDir: template.buildPath || './dist',
          entryFile: './' + (template.buildPath || 'dist') + '/index.html',
          excludes: ['node_modules', '*.log', '.git']
        },
        resource: {
          resourceId: '',
          resourceName: projectInfo.projectName,
          resourceType: projectInfo.initType === TYPE_PACKAGE ? 'package' :
            projectInfo.initType === TYPE_WIDGET ? 'widget' : 'theme',
          coverImages: [],
          description: '',
          tags: []
        },
        properties: [],
        customOptions: [],
        changelog: {
          [projectInfo.version || '1.0.0']: '初始版本'
        },
        dependencies: []
      };
      
      if (projectInfo.nameSpace) {
        config.nameSpace = projectInfo.nameSpace;
      }
      
      fs.writeJsonSync(configPath, config, { spaces: 2 });
      success('配置文件创建成功');
    }
    
    // 3. 安装依赖
    info('开始安装依赖...');
    await npmInstall(targetDir);
    success('依赖安装成功');
    
  } catch (err) {
    failSpinner('模板安装失败');
    throw err;
  }
}

/**
 * 安装自定义模板
 */
async function installCustomTemplate(template, projectInfo, targetPath) {
  info('开始执行自定义模板');
  
  const pkgPath = path.resolve(template.sourcePath, 'package.json');
  const pkg = fs.readJsonSync(pkgPath);
  const rootFile = path.resolve(template.sourcePath, pkg.main);
  
  if (!fs.existsSync(rootFile)) {
    throw new Error('自定义模板入口文件不存在！');
  }
  
  const targetDir = path.join(targetPath, projectInfo.projectName);
  await execCustomTemplate(rootFile, {
    targetPath: targetDir,
    data: projectInfo,
    template
  });
  
  success('自定义模板执行成功');
}

/**
 * 执行自定义模板脚本
 */
function execCustomTemplate(rootFile, options) {
  const code = `require('${rootFile}')(${JSON.stringify(options)})`;
  return new Promise((resolve, reject) => {
    const p = spawn('node', ['-e', code], { stdio: 'inherit' });
    p.on('error', e => reject(e));
    p.on('exit', c => resolve(c));
  });
}

/**
 * 执行 npm install
 */
function npmInstall(targetPath) {
  return new Promise((resolve, reject) => {
    const p = spawn('npm', ['install', '--registry=https://registry.npmmirror.com'], {
      stdio: 'inherit',
      cwd: targetPath,
      shell: true
    });
    p.on('error', e => reject(e));
    p.on('exit', c => resolve(c));
  });
}

/**
 * 格式化类名
 */
function formatClassName(name) {
  return name
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

module.exports = executeInit;

