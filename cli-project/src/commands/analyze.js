/**
 * 文件分析命令
 */

const fs = require('fs-extra');
const path = require('path');
const { readConfig } = require('../core/config');
const { logOperation, logError } = require('../core/logger');
const { startSpinner, spinner.succeed, spinner.fail } = require('../utils/spinner');
const { success, error, warning, info, title, createTable } = require('../utils/output');
const { formatFileSize } = require('../utils/file');

/**
 * 执行文件分析命令
 * @param {Object} options - 命令选项
 */
async function executeAnalyze(options) {
  try {
    logOperation('analyze', options);
    
    // 1. 确定要分析的文件路径
    let filePath = options.file;
    
    if (!filePath) {
      // 从配置文件获取
      const config = readConfig();
      if (config && config.local && config.local.buildDir) {
        filePath = path.join(process.cwd(), config.local.buildDir);
      } else {
        filePath = path.join(process.cwd(), 'dist');
      }
    }
    
    // 2. 检查文件/目录是否存在
    if (!fs.existsSync(filePath)) {
      console.log(chalk.red('✖ ') + `文件或目录不存在: ${filePath}`);
      process.exit(1);
    }
    
    title('文件分析');
    console.log(chalk.blue('ℹ ') + `分析目标: ${filePath}`);
    
    const spinner = ora('正在分析...').start();
    
    try {
      const analysis = await analyzeTarget(filePath);
      
      spinner.succeed('分析完成');
      
      // 3. 显示分析结果
      displayAnalysisResult(analysis, options);
      
      // 4. 如果指定了输出文件
      if (options.output) {
        const outputPath = path.resolve(process.cwd(), options.output);
        fs.writeJsonSync(outputPath, analysis, { spaces: 2 });
        console.log(chalk.green('✔ ') + `分析结果已保存到: ${outputPath}`);
      }
      
      logOperation('analyze_success', { filePath });
      
    } catch (err) {
      spinner.fail('分析失败');
      throw err;
    }
    
  } catch (err) {
    console.log(chalk.red('✖ ') + `执行文件分析命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

/**
 * 分析目标文件或目录
 */
async function analyzeTarget(targetPath) {
  const stats = fs.statSync(targetPath);
  
  if (stats.isDirectory()) {
    return await analyzeDirectory(targetPath);
  } else {
    return await analyzeFile(targetPath);
  }
}

/**
 * 分析目录
 */
async function analyzeDirectory(dirPath) {
  const files = [];
  const fileTypes = {};
  let totalSize = 0;
  
  // 递归遍历目录
  function traverseDir(dir) {
    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        traverseDir(itemPath);
      } else {
        const ext = path.extname(item).toLowerCase() || 'no-ext';
        const size = stats.size;
        
        files.push({
          path: path.relative(dirPath, itemPath),
          size,
          type: ext,
          modified: stats.mtime
        });
        
        totalSize += size;
        
        if (!fileTypes[ext]) {
          fileTypes[ext] = { count: 0, size: 0 };
        }
        fileTypes[ext].count++;
        fileTypes[ext].size += size;
      }
    });
  }
  
  traverseDir(dirPath);
  
  // 分析依赖
  const dependencies = analyzeDependencies(dirPath, files);
  
  // 分析入口文件
  const entryFiles = findEntryFiles(files);
  
  return {
    type: 'directory',
    path: dirPath,
    totalFiles: files.length,
    totalSize,
    fileTypes,
    files: files.slice(0, 20), // 只返回前20个文件
    dependencies,
    entryFiles,
    analyzedAt: new Date().toISOString()
  };
}

/**
 * 分析单个文件
 */
async function analyzeFile(filePath) {
  const stats = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  
  const analysis = {
    type: 'file',
    path: filePath,
    fileName: path.basename(filePath),
    extension: ext,
    size: stats.size,
    modified: stats.mtime,
    analyzedAt: new Date().toISOString()
  };
  
  // 根据文件类型进行特定分析
  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
    analysis.language = 'JavaScript/TypeScript';
    analysis.features = analyzeJavaScriptFile(filePath);
  } else if (['.html', '.htm'].includes(ext)) {
    analysis.language = 'HTML';
    analysis.features = analyzeHtmlFile(filePath);
  } else if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
    analysis.language = 'CSS';
    analysis.features = analyzeCssFile(filePath);
  } else if (['.json'].includes(ext)) {
    analysis.language = 'JSON';
    try {
      analysis.content = fs.readJsonSync(filePath);
    } catch {
      analysis.error = 'Invalid JSON';
    }
  }
  
  return analysis;
}

/**
 * 分析 JavaScript 文件
 */
function analyzeJavaScriptFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  return {
    lines: content.split('\n').length,
    hasImport: /import\s+/.test(content),
    hasExport: /export\s+/.test(content),
    hasReact: /from\s+['"]react['"]/.test(content),
    hasVue: /from\s+['"]vue['"]/.test(content),
    functions: (content.match(/function\s+\w+/g) || []).length,
    classes: (content.match(/class\s+\w+/g) || []).length
  };
}

/**
 * 分析 HTML 文件
 */
function analyzeHtmlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  return {
    lines: content.split('\n').length,
    hasTitle: /<title>/.test(content),
    hasScript: /<script/.test(content),
    hasStyle: /<style/.test(content),
    scripts: (content.match(/<script[^>]*>/g) || []).length,
    stylesheets: (content.match(/<link[^>]*stylesheet[^>]*>/g) || []).length
  };
}

/**
 * 分析 CSS 文件
 */
function analyzeCssFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  return {
    lines: content.split('\n').length,
    rules: (content.match(/\{/g) || []).length,
    hasImport: /@import/.test(content),
    hasMedia: /@media/.test(content)
  };
}

/**
 * 分析依赖
 */
function analyzeDependencies(dirPath, files) {
  const packageJsonPath = path.join(dirPath, 'package.json');
  
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = fs.readJsonSync(packageJsonPath);
      return {
        dependencies: Object.keys(packageJson.dependencies || {}),
        devDependencies: Object.keys(packageJson.devDependencies || {}),
        total: Object.keys(packageJson.dependencies || {}).length +
               Object.keys(packageJson.devDependencies || {}).length
      };
    } catch {
      return { error: 'Failed to parse package.json' };
    }
  }
  
  return { none: true };
}

/**
 * 查找入口文件
 */
function findEntryFiles(files) {
  const entryFiles = [];
  
  const entryPatterns = [
    /^index\.(html|js|jsx|ts|tsx)$/i,
    /^main\.(js|jsx|ts|tsx)$/i,
    /^app\.(js|jsx|ts|tsx)$/i
  ];
  
  files.forEach(file => {
    const fileName = path.basename(file.path);
    if (entryPatterns.some(pattern => pattern.test(fileName))) {
      entryFiles.push(file.path);
    }
  });
  
  return entryFiles;
}

/**
 * 显示分析结果
 */
function displayAnalysisResult(analysis, options) {
  console.log();
  
  if (analysis.type === 'directory') {
    // 目录分析结果
    console.log(chalk.green('✔ ') + `文件总数: ${analysis.totalFiles}`);
    console.log(chalk.green('✔ ') + `总大小: ${formatFileSize(analysis.totalSize)}`);
    
    // 文件类型统计
    if (options.format === 'table') {
      console.log();
      title('文件类型统计');
      
      const table = createTable({
        head: ['类型', '数量', '大小', '占比']
      });
      
      Object.entries(analysis.fileTypes)
        .sort((a, b) => b[1].size - a[1].size)
        .forEach(([type, data]) => {
          const percentage = ((data.size / analysis.totalSize) * 100).toFixed(2);
          table.push([
            type,
            data.count,
            formatFileSize(data.size),
            `${percentage}%`
          ]);
        });
      
      console.log(table.toString());
    } else {
      console.log();
      title('文件类型统计');
      Object.entries(analysis.fileTypes)
        .sort((a, b) => b[1].size - a[1].size)
        .forEach(([type, data]) => {
          const percentage = ((data.size / analysis.totalSize) * 100).toFixed(2);
          console.log(chalk.blue('ℹ ') + `${type}: ${data.count} 个文件, ${formatFileSize(data.size)} (${percentage}%)`);
        });
    }
    
    // 入口文件
    if (analysis.entryFiles.length > 0) {
      console.log();
      title('入口文件');
      analysis.entryFiles.forEach(file => {
        console.log(chalk.blue('ℹ ') + `  ${file}`);
      });
    }
    
    // 依赖信息
    if (analysis.dependencies && !analysis.dependencies.none) {
      console.log();
      title('依赖信息');
      if (analysis.dependencies.error) {
        console.log(chalk.yellow('⚠ ') + analysis.dependencies.error);
      } else {
        console.log(chalk.blue('ℹ ') + `生产依赖: ${analysis.dependencies.dependencies.length} 个`);
        console.log(chalk.blue('ℹ ') + `开发依赖: ${analysis.dependencies.devDependencies.length} 个`);
        console.log(chalk.blue('ℹ ') + `总计: ${analysis.dependencies.total} 个`);
      }
    }
    
  } else {
    // 单文件分析结果
    console.log(chalk.green('✔ ') + `文件名: ${analysis.fileName}`);
    console.log(chalk.green('✔ ') + `文件类型: ${analysis.extension}`);
    console.log(chalk.green('✔ ') + `文件大小: ${formatFileSize(analysis.size)}`);
    console.log(chalk.green('✔ ') + `修改时间: ${new Date(analysis.modified).toLocaleString()}`);
    
    if (analysis.features) {
      console.log();
      title('文件特征');
      Object.entries(analysis.features).forEach(([key, value]) => {
        console.log(chalk.blue('ℹ ') + `${key}: ${value}`);
      });
    }
  }
  
  console.log();
}

module.exports = executeAnalyze;

