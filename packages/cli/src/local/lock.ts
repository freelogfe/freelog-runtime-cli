/** `.freelog/.lock`：原子独占、带诊断元数据、可确认死亡进程的遗留锁恢复，并支持同进程重入。 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, fsyncSync } from 'node:fs';
import path from 'node:path';
import { CliError } from '../core/errors';
import { freelogDir } from './identity';
import { recoverPendingTransaction } from './transaction';

export type ProjectLock = { release: () => void };
type LockMetadata = { pid: number; startedAt: string; command: string };
/**
 * 只允许同一条异步调用链重入。不能按 pid 判定：同一 Node 进程中的
 * Promise.all 仍是并发写，必须得到 PROJECT_LOCKED，而不是共享临界区。
 */
const lockContext = new AsyncLocalStorage<Set<string>>();

/** 返回工作区的瞬态锁路径。 */
export function lockFilePath(cwd: string): string {
  return path.join(freelogDir(cwd), '.lock');
}

/** `init` 的目标可能还不存在，故锁必须放在其父目录而不是目标内。 */
export function initLockFilePath(targetDir: string): string {
  const absolute = path.resolve(targetDir);
  return path.join(path.dirname(absolute), `.${path.basename(absolute)}.freelog-init.lock`);
}

function readMetadata(filePath: string): LockMetadata | undefined {
  try {
    const value = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<LockMetadata>;
    return typeof value.pid === 'number' && typeof value.startedAt === 'string' && typeof value.command === 'string'
      ? value as LockMetadata : undefined;
  } catch { return undefined; }
}

function isProcessAlive(pid: number): boolean | undefined {
  try { process.kill(pid, 0); return true; } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ESRCH' ? false : undefined;
  }
}

/** 原子获取锁；仅能确认 owner 已退出时自动删除遗留锁。 */
function acquireLockFile(filePath: string, command: string): ProjectLock {
  mkdirSync(path.dirname(filePath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let fd: number | undefined;
    try {
      fd = openSync(filePath, 'wx');
      const metadata: LockMetadata = { pid: process.pid, startedAt: new Date().toISOString(), command };
      writeFileSync(fd, `${JSON.stringify(metadata)}\n`, 'utf8');
      fsyncSync(fd);
      closeSync(fd); fd = undefined;
      let released = false;
      return { release() { if (!released) { released = true; if (existsSync(filePath)) unlinkSync(filePath); } } };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      const metadata = readMetadata(filePath);
      if (metadata && isProcessAlive(metadata.pid) === false && attempt === 0) { unlinkSync(filePath); continue; }
      const holder = metadata ? `（pid ${metadata.pid}，${metadata.command}）` : '';
      throw new CliError(`工程正在被另一进程写入${holder}`, 'PROJECT_LOCKED');
    } finally { if (fd !== undefined) closeSync(fd); }
  }
  throw new CliError('工程正在被另一进程写入', 'PROJECT_LOCKED');
}

/** 原子获取工作区状态锁。 */
export function acquireProjectLock(cwd: string, command = 'local-write'): ProjectLock {
  return acquireLockFile(lockFilePath(cwd), command);
}

/** 原子获取 init 目标锁；目标不存在时也不会创建 `.freelog/`。 */
export function acquireInitLock(targetDir: string): ProjectLock {
  return acquireLockFile(initLockFilePath(targetDir), 'init');
}

/** 锁内运行同步或异步本地写入；同一个进程的嵌套写入复用同一把锁。 */
export function withProjectLock<T>(cwd: string, fn: () => T, command?: string): T {
  const key = path.resolve(cwd);
  if (lockContext.getStore()?.has(key)) {
    return fn();
  }
  const lock = acquireProjectLock(cwd, command);
  const parent = lockContext.getStore();
  const context = new Set(parent);
  context.add(key);
  return lockContext.run(context, () => {
    try {
      recoverPendingTransaction(cwd);
      const result = fn();
      if (result && typeof (result as unknown as Promise<unknown>).then === 'function') {
        return (result as unknown as Promise<unknown>).finally(() => lock.release()) as T;
      }
      lock.release();
      return result;
    } catch (error) {
      lock.release();
      throw error;
    }
  });
}

/**
 * 以目标绝对路径区分 init；同一调用链可重入，不同异步链仍严格互斥。
 * 这把锁覆盖“再次确认目录为空 → staging → 提交”的整个窗口。
 */
export function withInitLock<T>(targetDir: string, fn: () => T): T {
  const key = `init:${path.resolve(targetDir)}`;
  if (lockContext.getStore()?.has(key)) {
    return fn();
  }
  const lock = acquireInitLock(targetDir);
  const parent = lockContext.getStore();
  const context = new Set(parent);
  context.add(key);
  return lockContext.run(context, () => {
    try {
      const result = fn();
      if (result && typeof (result as unknown as Promise<unknown>).then === 'function') {
        return (result as unknown as Promise<unknown>).finally(() => lock.release()) as T;
      }
      lock.release();
      return result;
    } catch (error) {
      lock.release();
      throw error;
    }
  });
}
