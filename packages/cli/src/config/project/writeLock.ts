import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';

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
    // An incomplete lock can only be reclaimed after a grace period.
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

/** Hold a synchronous, reentrant, cross-process lock for the complete project mutation. */
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
 * Hold the cross-process project lock until an asynchronous mutation settles. Calls made inside
 * the same async operation are reentrant; unrelated same-process operations still contend.
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
