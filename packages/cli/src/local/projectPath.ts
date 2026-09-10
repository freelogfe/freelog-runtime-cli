/** 工作区文件路径：所有写入身份状态的路径均以工作区相对、跨平台稳定的形式保存。 */

import path from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
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
  const normalized = relative.replaceAll('\\', '/');
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
    || normalized === '.freelog' || normalized.startsWith('.freelog/')) {
    throw new CliError(error.message, error.code);
  }
  return normalized;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * 对已存在的本地产物补上真实路径边界检查。词法上的 `project/link` 不能借由
 * 符号链接逃到工程外；返回真实路径，供占用/嵌套比较使用。
 */
export function resolveExistingProjectPath(
  cwd: string,
  filePath: string,
  error: ProjectPathError = defaultError,
): string {
  const root = path.resolve(cwd);
  const absolute = path.resolve(root, filePath);
  if (!existsSync(absolute)) {
    // 目标不存在时无法 realpath；仍用词法边界拒绝明显的 `..` 逃逸。
    if (!isInside(root, absolute)) throw new CliError(error.message, error.code);
    return absolute;
  }
  const realRoot = realpathSync(root);
  const realTarget = realpathSync(absolute);
  if (!isInside(realRoot, realTarget)) {
    throw new CliError(error.message, error.code);
  }
  return realTarget;
}
