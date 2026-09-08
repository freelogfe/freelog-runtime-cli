/** `.freelog/.lock`：原子独占、带诊断元数据、可确认死亡进程的遗留锁恢复，并支持同进程重入。 */

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, fsyncSync } from 'node:fs';
import path from 'node:path';
import { CliError } from '../core/errors';
import { freelogDir } from './identity';

export type ProjectLock = { release: () => void };
type LockMetadata = { pid: number; startedAt: string; command: string };
const held = new Map<string, { count: number; lock: ProjectLock }>();

/** 返回工作区的瞬态锁路径。 */
export function lockFilePath(cwd: string): string {
  return path.join(freelogDir(cwd), '.lock');
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
export function acquireProjectLock(cwd: string, command = 'local-write'): ProjectLock {
  const filePath = lockFilePath(cwd);
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

/** 锁内运行同步或异步本地写入；同一个进程的嵌套写入复用同一把锁。 */
export function withProjectLock<T>(cwd: string, fn: () => T, command?: string): T {
  const key = path.resolve(cwd);
  const current = held.get(key);
  if (current) {
    current.count += 1;
    try { return fn(); } finally { current.count -= 1; }
  }
  const lock = acquireProjectLock(cwd, command);
  const state = { count: 1, lock };
  held.set(key, state);
  const finish = () => { if (--state.count === 0) { held.delete(key); lock.release(); } };
  try {
    const result = fn();
    if (result && typeof (result as unknown as Promise<unknown>).then === 'function') return (result as unknown as Promise<unknown>).finally(finish) as T;
    finish(); return result;
  } catch (error) { finish(); throw error; }
}
