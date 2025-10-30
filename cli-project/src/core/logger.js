/**
 * 日志系统
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');
const { LOG_CONFIG } = require('../constants/config');

// 确保日志目录存在
fs.ensureDirSync(LOG_CONFIG.logDir);

// 创建日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (stack) {
      log += `\n${stack}`;
    }
    return log;
  })
);

// 创建 logger 实例
const logger = winston.createLogger({
  level: LOG_CONFIG.level,
  format: logFormat,
  transports: [
    // 写入所有日志到文件
    new winston.transports.File({
      filename: path.join(LOG_CONFIG.logDir, 'error.log'),
      level: 'error',
      maxsize: LOG_CONFIG.maxSize,
      maxFiles: LOG_CONFIG.maxFiles
    }),
    new winston.transports.File({
      filename: path.join(LOG_CONFIG.logDir, 'combined.log'),
      maxsize: LOG_CONFIG.maxSize,
      maxFiles: LOG_CONFIG.maxFiles
    })
  ]
});

// 开发环境输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

/**
 * 记录操作日志
 */
function logOperation(operation, data = {}) {
  logger.info(`Operation: ${operation}`, { data, timestamp: new Date().toISOString() });
}

/**
 * 记录错误
 */
function logError(error, context = {}) {
  logger.error(error.message, {
    error: error.stack || error,
    context,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  logger,
  logOperation,
  logError
};

