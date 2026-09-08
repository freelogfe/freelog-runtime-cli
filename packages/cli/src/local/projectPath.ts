/** 工作区文件路径：所有写入身份状态的路径均以工作区相对、跨平台稳定的形式保存。 */

import path from 'node:path';
import { CliError } from '../core/errors';

export type ProjectPathError = {
  code: string;
  message: string;
};

const defaultError: ProjectPathError = {
  code: 'FILE_PATH_OUTSIDE_PROJECT',
  message: '路径必须落在当前工程里',
};

/**
 * 将用户路径规范为相对工作区根目录的 key。
 * 不接受绝对路径、工程根本身、空字符串或经 `..` 逃出工程的路径。
 */
export function normalizeProjectPath(
  cwd: string,
  rawPath: string,
  error: ProjectPathError = defaultError,
): string {
  if (
    !rawPath.trim() ||
    path.isAbsolute(rawPath) ||
    path.win32.isAbsolute(rawPath) ||
    path.posix.isAbsolute(rawPath)
  ) {
    throw new CliError(error.message, error.code);
  }

  const root = path.resolve(cwd);
  const resolved = path.resolve(root, rawPath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new CliError(error.message, error.code);
  }
  return relative.replaceAll('\\', '/');
}
