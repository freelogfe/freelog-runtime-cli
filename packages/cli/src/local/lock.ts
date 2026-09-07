/** 进程写锁 .freelog/lock：防两个 CLI 同时写工程；进程退出即删，残留可手动删。 */

import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { CliError } from '../core/errors';
import { freelogDir } from './identity';

export type ProjectLock = {
  release: () => void;
};

/** 锁文件路径：<cwd>/.freelog/lock（存在即表示有进程在写）。 */
export function lockFilePath(cwd: string): string {
  return path.join(freelogDir(cwd), 'lock');
}

/** 抢锁：`wx` 独占创建，已存在报 PROJECT_LOCKED；调用方负责 release（进程崩溃会留残锁，手动删即可）。 */
export function acquireProjectLock(cwd: string): ProjectLock {
  const dir = freelogDir(cwd);
  mkdirSync(dir, { recursive: true });
  const filePath = lockFilePath(cwd);
  let fd: number;
  try {
    fd = openSync(filePath, 'wx');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      // i18n: cli.local.project_locked
      throw new CliError('工程正在被另一进程写入，请稍后再试', 'PROJECT_LOCKED');
    }
    throw error;
  }
  closeSync(fd);

  let released = false;
  return {
    release() {
      if (released) {
        return;
      }
      released = true;
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    },
  };
}

/** 包一层自动释放的锁：同步/异步结果都兜底 release，异常也会释放。 */
export function withProjectLock<T>(cwd: string, fn: () => T): T {
  const lock = acquireProjectLock(cwd);
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      lock.release();
    }
  };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(release) as T;
    }
    release();
    return result;
  } catch (error) {
    release();
    throw error;
  }
}
