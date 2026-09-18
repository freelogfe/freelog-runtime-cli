/**
 * 本地多文件提交日志。主本改动先写 `.txn.json`，随后逐个原子替换；进程中断后
 * 下一次持锁操作按日志前滚到同一个完整状态。当前状态只写身份、工作稿、编号与
 * 未决操作；为不中断旧版本留下的事务，恢复时仍可处理其中的遗留 `index.json` 条目。
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../core/atomicWrite';
import { CliError } from '../core/errors';
import { freelogDir } from './identity';

type TransactionEntry = {
  path: string;
  before: string | null;
  beforeSha256: string | null;
  after: string | null;
  afterSha256: string | null;
};

type Transaction = {
  schemaVersion: 1;
  entries: TransactionEntry[];
};

export type LocalChange = { path: string; content: string | null };

/** 返回工作区未完成事务日志路径。 */
export function transactionFilePath(cwd: string): string {
  return path.join(freelogDir(cwd), '.txn.json');
}

function sha256(content: string | null): string | null {
  return content === null ? null : createHash('sha256').update(content).digest('hex');
}

function readText(filePath: string): string | null {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;
}

/**
 * 事务日志只允许描述 `.freelog` 根目录下、由状态层拥有的主本。日志不能保存
 * 绝对路径：工程移动后仍能恢复，且损坏/恶意日志绝不能把恢复操作引到工程外。
 */
function resolveTransactionTarget(cwd: string, entryPath: string, allowLegacyIndex = false): string {
  const root = path.resolve(freelogDir(cwd));
  const allowed = (allowLegacyIndex && entryPath === 'index.json')
    || entryPath === '.sequence'
    || entryPath === '.pending-operation.json'
    || /^[1-9]\d*(?:\.version)?\.json$/.test(entryPath);
  if (!allowed || path.isAbsolute(entryPath) || entryPath.includes('/') || entryPath.includes('\\')) {
    throw new CliError('本地事务日志包含不允许的目标', 'LOCAL_TXN_INVALID');
  }
  const target = path.resolve(root, entryPath);
  if (path.dirname(target) !== root) {
    throw new CliError('本地事务日志包含越界目标', 'LOCAL_TXN_INVALID');
  }
  return target;
}

function validateTransaction(cwd: string, raw: unknown): Transaction {
  const value = raw as Partial<Transaction>;
  if (value?.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length === 0) {
    throw new CliError('本地事务日志无效，请先备份 .freelog 后处理', 'LOCAL_TXN_INVALID');
  }
  const targets = new Set<string>();
  for (const entry of value.entries) {
    if (!entry || typeof entry.path !== 'string'
      || (entry.before !== null && typeof entry.before !== 'string')
      || (entry.after !== null && typeof entry.after !== 'string')
      || entry.beforeSha256 !== sha256(entry.before)
      || entry.afterSha256 !== sha256(entry.after)) {
      throw new CliError('本地事务日志校验失败，请先备份 .freelog 后处理', 'LOCAL_TXN_INVALID');
    }
    const target = resolveTransactionTarget(cwd, entry.path, true);
    if (targets.has(target)) {
      throw new CliError('本地事务日志包含重复目标', 'LOCAL_TXN_INVALID');
    }
    targets.add(target);
  }
  return value as Transaction;
}

function applyEntry(cwd: string, entry: TransactionEntry): void {
  const target = resolveTransactionTarget(cwd, entry.path, true);
  const current = readText(target);
  if (current === entry.after) return;
  if (current !== entry.before) {
    throw new CliError(`本地事务与 ${entry.path} 冲突，拒绝猜测覆盖`, 'LOCAL_TXN_CONFLICT');
  }
  if (entry.after === null) {
    if (existsSync(target)) unlinkSync(target);
  } else {
    atomicWriteFile(target, entry.after);
  }
}

/** 在已持有项目锁时恢复未完成事务；成功恢复后删除日志。 */
export function recoverPendingTransaction(cwd: string): void {
  const txnPath = transactionFilePath(cwd);
  if (!existsSync(txnPath)) return;
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(txnPath, 'utf8')); } catch {
    throw new CliError('本地事务日志无法解析，请先备份 .freelog 后处理', 'LOCAL_TXN_INVALID');
  }
  const transaction = validateTransaction(cwd, raw);
  for (const entry of transaction.entries) applyEntry(cwd, entry);
  unlinkSync(txnPath);
}

/**
 * 在已持有项目锁时提交一组主本改动。所有目标必须位于 `.freelog` 内，防止
 * 状态层把事务日志用于工作区任意文件。
 */
export function commitLocalTransaction(cwd: string, changes: readonly LocalChange[]): void {
  if (changes.length === 0) return;
  const root = path.resolve(freelogDir(cwd));
  const paths = new Set<string>();
  const entries = changes.map((change) => {
    const target = path.resolve(change.path);
    if (path.dirname(target) !== root || paths.has(target)) {
      throw new CliError('本地事务目标无效', 'LOCAL_TXN_INVALID');
    }
    const relativePath = path.basename(target);
    // 复用恢复路径的白名单，提交方也不能创建一份永远无法恢复的日志。
    resolveTransactionTarget(cwd, relativePath);
    paths.add(target);
    const before = readText(target);
    return {
      path: relativePath,
      before,
      beforeSha256: sha256(before),
      after: change.content,
      afterSha256: sha256(change.content),
    };
  }).filter((entry) => entry.before !== entry.after);
  if (entries.length === 0) return;
  atomicWriteFile(transactionFilePath(cwd), `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`);
  for (const entry of entries) applyEntry(cwd, entry);
  unlinkSync(transactionFilePath(cwd));
}
