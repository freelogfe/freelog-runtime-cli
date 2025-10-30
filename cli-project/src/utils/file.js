/**
 * 文件操作工具
 */

const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const { FreelogError } = require('../constants/errors');
const { UPLOAD_CONFIG } = require('../constants/config');

/**
 * 压缩文件或目录
 * @param {string} source - 源路径
 * @param {string} output - 输出路径
 * @returns {Promise<string>} 输出文件路径
 */
async function zipDirectory(source, output) {
  return new Promise((resolve, reject) => {
    const outputStream = fs.createWriteStream(output);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });
    
    outputStream.on('close', () => {
      resolve(output);
    });
    
    archive.on('error', err => {
      reject(err);
    });
    
    archive.pipe(outputStream);
    
    // 如果是目录，压缩整个目录
    if (fs.statSync(source).isDirectory()) {
      archive.directory(source, false);
    } else {
      // 如果是文件，压缩单个文件
      archive.file(source, { name: path.basename(source) });
    }
    
    archive.finalize();
  });
}

/**
 * 检查文件大小
 * @param {string} filePath - 文件路径
 * @returns {number} 文件大小（字节）
 */
function getFileSize(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new FreelogError('FILE_001', filePath);
  }
  
  const stats = fs.statSync(filePath);
  return stats.size;
}

/**
 * 验证文件大小
 * @param {string} filePath - 文件路径
 * @param {number} maxSize - 最大大小（字节）
 * @returns {boolean} 是否通过验证
 */
function validateFileSize(filePath, maxSize = UPLOAD_CONFIG.maxSize) {
  const size = getFileSize(filePath);
  
  if (size > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2);
    const fileSizeMB = (size / (1024 * 1024)).toFixed(2);
    throw new FreelogError('FILE_003', `文件大小 ${fileSizeMB}MB 超过限制 ${maxSizeMB}MB`);
  }
  
  return true;
}

/**
 * 验证文件类型
 * @param {string} filePath - 文件路径
 * @param {Array} allowedTypes - 允许的文件类型
 * @returns {boolean} 是否通过验证
 */
function validateFileType(filePath, allowedTypes = UPLOAD_CONFIG.supportedTypes) {
  const ext = path.extname(filePath).toLowerCase();
  
  // 检查多段扩展名（如 .tar.gz）
  const fileName = path.basename(filePath).toLowerCase();
  const isAllowed = allowedTypes.some(type => {
    return fileName.endsWith(type.toLowerCase()) || ext === type.toLowerCase();
  });
  
  if (!isAllowed) {
    throw new FreelogError('FILE_002', `不支持的文件类型: ${ext}`);
  }
  
  return true;
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 复制目录
 * @param {string} src - 源目录
 * @param {string} dest - 目标目录
 * @param {Object} options - 选项
 */
async function copyDirectory(src, dest, options = {}) {
  try {
    await fs.copy(src, dest, {
      overwrite: options.overwrite !== false,
      filter: options.filter
    });
  } catch (error) {
    throw new FreelogError('FILE_001', `复制目录失败: ${error.message}`);
  }
}

/**
 * 删除目录或文件
 * @param {string} target - 目标路径
 */
async function removeTarget(target) {
  try {
    if (fs.existsSync(target)) {
      await fs.remove(target);
    }
  } catch (error) {
    throw new FreelogError('FILE_001', `删除失败: ${error.message}`);
  }
}

/**
 * 确保目录存在
 * @param {string} dir - 目录路径
 */
async function ensureDirectory(dir) {
  try {
    await fs.ensureDir(dir);
  } catch (error) {
    throw new FreelogError('FILE_001', `创建目录失败: ${error.message}`);
  }
}

/**
 * 读取 JSON 文件
 * @param {string} filePath - 文件路径
 * @returns {Object} JSON 对象
 */
function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new FreelogError('FILE_001', filePath);
    }
    return fs.readJsonSync(filePath);
  } catch (error) {
    if (error instanceof FreelogError) {
      throw error;
    }
    throw new FreelogError('CONFIG_002', `解析 JSON 失败: ${error.message}`);
  }
}

/**
 * 写入 JSON 文件
 * @param {string} filePath - 文件路径
 * @param {Object} data - 数据
 */
function writeJsonFile(filePath, data) {
  try {
    fs.writeJsonSync(filePath, data, { spaces: 2 });
  } catch (error) {
    throw new FreelogError('FILE_001', `写入文件失败: ${error.message}`);
  }
}

module.exports = {
  zipDirectory,
  getFileSize,
  validateFileSize,
  validateFileType,
  formatFileSize,
  copyDirectory,
  removeTarget,
  ensureDirectory,
  readJsonFile,
  writeJsonFile
};

