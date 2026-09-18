import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';

/**
 * 项目级写锁：文件锁负责跨进程互斥，AsyncLocalStorage 只让同一异步调用链可重入。
 * 兄弟 Promise 不共享重入资格；无法解析的锁经过宽限期才能回收，PID 不确定时 fail closed。
 */
const heldProjectLocks = new AsyncLocalStorage<ReadonlySet<string>>();

function resolveRoot(cwd?: string): string {
  return path.resolve(cwd || process.cwd());
}

function lockPath(root: string): string {
  return path.join(root, '.freelog', 'tmp', 'project-write.lock');
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/**
 * 只回收可证明已失效的锁。解析失败的锁先等待 30 秒宽限期；PID 检查除明确 ESRCH 外一律视为
 * 仍存活，避免权限/平台差异导致两个 CLI 进程同时写同一项目。
 */
function removeStaleLock(file: string): boolean {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }

  let pid: number | undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { pid?: unknown };
    const parsedPid = Number(parsed.pid);
    if (Number.isInteger(parsedPid) && parsedPid > 0) pid = parsedPid;
  } catch {
    // 进程可能在创建文件后、写入 PID 前退出；未知 owner 只能按 mtime 宽限期回收。
  }

  const stale = pid === undefined ? Date.now() - stat.mtimeMs > 30_000 : !isProcessRunning(pid);
  if (!stale) return false;
  try {
    fs.unlinkSync(file);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
}

function lockError(file: string, cause?: unknown) {
  return cliError(I18N_KEYS.project_write_locked, {
    code: 2,
    details: { lockFile: file },
    hint: '请等待其他命令结束后重试；若进程已异常退出，下次写入会自动清理残留锁',
    cause,
  });
}

/** `wx` 创建是跨进程原子仲裁；不得把“锁存在”降级为轮询后继续写。 */
function acquireProjectLock(root: string): string {
  const file = lockPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let acquired = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let fd: number | undefined;
    try {
      fd = fs.openSync(file, 'wx', 0o600);
      fs.writeFileSync(
        fd,
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
      );
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      acquired = true;
      break;
    } catch (error) {
      if (fd !== undefined) fs.closeSync(fd);
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !removeStaleLock(file)) {
        throw lockError(file, error);
      }
    }
  }
  if (!acquired) throw lockError(file);
  return file;
}

function releaseProjectLock(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** 同步、可重入、跨进程锁；action 必须覆盖完整的 read-modify-write。 */
export function withProjectWriteLock<T>(cwd: string | undefined, action: () => T): T {
  const root = resolveRoot(cwd);
  const inherited = heldProjectLocks.getStore();
  if (inherited?.has(root)) return action();

  const file = acquireProjectLock(root);
  try {
    return heldProjectLocks.run(new Set([...(inherited || []), root]), action);
  } finally {
    releaseProjectLock(file);
  }
}

/**
 * 异步锁一直持有到 mutation settle。同一 async context 内可重入；无关并发仍然竞争。
 */
export async function withProjectWriteLockAsync<T>(
  cwd: string | undefined,
  action: () => Promise<T>,
): Promise<T> {
  const root = resolveRoot(cwd);
  const inherited = heldProjectLocks.getStore();
  if (inherited?.has(root)) return action();
  const file = acquireProjectLock(root);
  try {
    return await heldProjectLocks.run(new Set([...(inherited || []), root]), action);
  } finally {
    releaseProjectLock(file);
  }
}
