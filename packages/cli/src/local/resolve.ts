/** 工程内资源身份解析：单份静默选择，多份须由 `--resource` 精确选择。 */

import { CliError } from '../core/errors';
import { existsSync, readdirSync } from 'node:fs';
import { readDraft } from './draft';
import { freelogDir, listIdentities } from './identity';
import { normalizeProjectPath } from './projectPath';
import type { IdentityRecord } from './types';

function assertNoDuplicate(
  cwd: string,
  identities: readonly IdentityRecord[],
  key: 'resourceId' | 'name' | 'filePath',
): void {
  const seen = new Map<string, number>();
  for (const identity of identities) {
    const value = identity[key];
    if (!value) continue;
    // filePath 是工作区相对的规范路径；不能让手工写入的 `./a.mp4`
    // 或 `dir/../a.mp4` 绕过“一份产物只属于一份身份”的不变量。
    const comparable = key === 'filePath' ? normalizeProjectPath(cwd, value) : value;
    const previous = seen.get(comparable);
    if (previous !== undefined) {
      throw new CliError(`本地状态冲突：${previous}.json 与 ${identity.n}.json 使用同一 ${key}`, 'IDENTITY_CONFLICT');
    }
    seen.set(comparable, identity.n);
  }
}

function matches(identity: IdentityRecord, selector: string): boolean {
  if (selector.startsWith('file:')) return `${identity.n}.json` === selector.slice(5);
  if (selector.startsWith('id:')) return identity.resourceId === selector.slice(3);
  if (selector.startsWith('name:')) return identity.name === selector.slice(5) || identity.name === selector.slice(5).split('/').pop();
  if (selector.startsWith('title:')) return identity.title === selector.slice(6);
  return `${identity.n}.json` === selector
    || identity.resourceId === selector
    || identity.name === selector
    || identity.title === selector;
}

const DRAFT_FILE_RE = /^([1-9]\d*)\.version\.json$/;

/**
 * 在任何资源命令访问平台前校验整个工作区，而不只校验最终选中的 N.json。
 * 这样复制身份、孤儿稿或错配稿都不能把后续写入落到不可信的状态上。
 */
export function validateLocalState(cwd: string): IdentityRecord[] {
  const identities = listIdentities(cwd);
  assertNoDuplicate(cwd, identities, 'resourceId');
  assertNoDuplicate(cwd, identities, 'name');
  assertNoDuplicate(cwd, identities, 'filePath');
  const numbers = new Set(identities.map((identity) => identity.n));
  const dir = freelogDir(cwd);
  if (!existsSync(dir)) return identities;
  for (const fileName of readdirSync(dir)) {
    const match = DRAFT_FILE_RE.exec(fileName);
    if (!match) continue;
    const n = Number(match[1]);
    if (!numbers.has(n)) {
      throw new CliError(`工作稿 ${fileName} 没有同号身份文件`, 'DRAFT_ORPHAN');
    }
    readDraft(cwd, n);
  }
  return identities;
}

/** 解析 `file:N.json`、`id:`、`name:`、`title:` 或无前缀精确选择器。 */
export function resolveIdentity(cwd: string, selector?: string): IdentityRecord {
  const identities = validateLocalState(cwd);
  if (identities.length === 0) {
    throw new CliError(
      '当前目录没有资源状态。新资源可直接 create --type <叶子类型> --artifact <路径>，也可先 init 再 create；已有资源请 bind <资源 ID|标识符> --artifact <路径>。',
      'IDENTITY_NOT_FOUND',
    );
  }
  if (!selector) {
    if (identities.length === 1) return identities[0]!;
    throw new CliError('当前工程有多份资源状态；请使用 --resource 指定资源', 'IDENTITY_RESOURCE_REQUIRED');
  }
  const matched = identities.filter((identity) => matches(identity, selector));
  if (matched.length === 1) return matched[0]!;
  if (matched.length === 0) {
    throw new CliError(`找不到资源选择器 ${selector}`, 'IDENTITY_RESOURCE_NOT_FOUND');
  }
  throw new CliError(`资源选择器 ${selector} 匹配多份状态；请使用 file:、id: 或 name:`, 'IDENTITY_RESOURCE_AMBIGUOUS');
}
