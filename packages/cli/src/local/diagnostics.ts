/**
 * `.freelog` 的只读诊断。它刻意不复用 validateLocalState：后者正确地在业务动作前 fail-closed，
 * 而诊断必须在状态已经坏掉时仍能列出每一个可见文件和故障位置。
 */

import { existsSync, readdirSync } from 'node:fs';
import { readDraft } from './draft';
import { freelogDir, readIdentity } from './identity';
import { readPendingOperation } from './pendingOperation';
import { normalizeProjectPath } from './projectPath';
import type { IdentityRecord } from './types';

const IDENTITY_FILE_RE = /^([1-9]\d*)\.json$/;
const DRAFT_FILE_RE = /^([1-9]\d*)\.version\.json$/;

type Diagnostic = { file: string; code: string; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

function duplicateDiagnostics(cwd: string, identities: readonly IdentityRecord[]): Diagnostic[] {
  const result: Diagnostic[] = [];
  for (const key of ['resourceId', 'resourceName', 'filePath'] as const) {
    const seen = new Map<string, number>();
    for (const identity of identities) {
      const raw = identity[key];
      if (!raw) continue;
      let value: string;
      try {
        value = key === 'filePath' ? normalizeProjectPath(cwd, raw) : raw;
      } catch (error) {
        result.push({ file: `${identity.n}.json`, code: 'IDENTITY_PATH_INVALID', message: errorMessage(error) });
        continue;
      }
      const previous = seen.get(value);
      if (previous !== undefined) {
        result.push({
          file: `${identity.n}.json`,
          code: 'IDENTITY_CONFLICT',
          message: `与 ${previous}.json 使用相同 ${key}`,
        });
      } else {
        seen.set(value, identity.n);
      }
    }
  }
  return result;
}

/** 在任何损坏状态下都返回报告；诊断本身不抛业务校验异常。 */
export function diagnoseLocalState(cwd: string): string {
  const dir = freelogDir(cwd);
  if (!existsSync(dir)) return '没有 .freelog 本地状态';
  let entries: string[];
  try {
    entries = readdirSync(dir).sort((left, right) => left.localeCompare(right, 'en'));
  } catch (error) {
    return `无法读取 .freelog：${errorMessage(error)}`;
  }

  const lines: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const identityNumbers = new Set<number>();
  const validIdentities: IdentityRecord[] = [];

  for (const file of entries) {
    const match = IDENTITY_FILE_RE.exec(file);
    if (!match) continue;
    const n = Number(match[1]);
    identityNumbers.add(n);
    try {
      const identity = readIdentity(cwd, n);
      validIdentities.push(identity);
      lines.push(`${file}：有效（${identity.resourceId ?? '未绑定'}，${identity.typeCode}，${identity.filePath}）`);
    } catch (error) {
      diagnostics.push({ file, code: 'IDENTITY_INVALID', message: errorMessage(error) });
    }
  }

  for (const file of entries) {
    const match = DRAFT_FILE_RE.exec(file);
    if (!match) continue;
    const n = Number(match[1]);
    if (!identityNumbers.has(n)) {
      diagnostics.push({ file, code: 'DRAFT_ORPHAN', message: `没有同号 ${n}.json` });
      continue;
    }
    if (!validIdentities.some((identity) => identity.n === n)) {
      diagnostics.push({ file, code: 'DRAFT_IDENTITY_INVALID', message: `同号 ${n}.json 已损坏，无法核验工作稿` });
      continue;
    }
    try {
      const draft = readDraft(cwd, n);
      lines.push(`${file}：有效（${draft?.draftKind ?? '无'} 工作稿）`);
    } catch (error) {
      diagnostics.push({ file, code: 'DRAFT_INVALID', message: errorMessage(error) });
    }
  }

  diagnostics.push(...duplicateDiagnostics(cwd, validIdentities));

  if (entries.includes('index.json')) {
    lines.push('index.json：历史遗留文件，当前 CLI 不读取、不重建也不自动删除');
  }

  try {
    const pending = readPendingOperation(cwd);
    if (pending) lines.push(`.pending-operation.json：未决 ${pending.kind}（${pending.resourceId} ${pending.version}）`);
  } catch (error) {
    diagnostics.push({ file: '.pending-operation.json', code: 'PENDING_OPERATION_INVALID', message: errorMessage(error) });
  }
  if (entries.includes('.txn.json')) {
    lines.push('.txn.json：存在；下一次持锁业务命令会尝试恢复，诊断命令不会回放');
  }

  if (lines.length === 0) lines.push('没有可识别的资源身份或工作稿');
  if (diagnostics.length === 0) return `本地状态正常：\n${lines.map((line) => `- ${line}`).join('\n')}`;
  return [
    '本地状态存在问题（未修改任何文件）：',
    ...lines.map((line) => `- ${line}`),
    ...diagnostics.map((item) => `- ${item.file} [${item.code}]：${item.message}`),
    '请先备份 .freelog；修复或删除明确无用的完整状态单元后再执行业务命令。',
  ].join('\n');
}
