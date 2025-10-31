import path from 'node:path';
import winston from 'winston';
import { ensureDir } from '../utils/fs.js';
import { LOG_DIR, WORKSPACE_LOG_DIR } from '../constants/paths.js';

let loggerInstance = null;

export async function getLogger() {
  if (loggerInstance) {
    return loggerInstance;
  }
  await Promise.all([ensureDir(LOG_DIR), ensureDir(WORKSPACE_LOG_DIR)]);
  loggerInstance = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ level, message, timestamp }) => `${timestamp} [${level}] ${message}`)
    ),
    transports: [
      new winston.transports.File({
        filename: path.join(LOG_DIR, 'freelog-cli.log'),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: path.join(WORKSPACE_LOG_DIR, 'freelog-cli.log'),
        maxsize: 5 * 1024 * 1024,
        maxFiles: 3
      })
    ]
  });
  if (process.env.NODE_ENV !== 'production') {
    loggerInstance.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message }) => `[${level}] ${message}`)
        )
      })
    );
  }
  return loggerInstance;
}
