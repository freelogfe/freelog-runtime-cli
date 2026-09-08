/** 工程内资源身份解析：单份静默选择，多份须由 `--resource` 精确选择。 */

import { CliError } from '../core/errors';
import { listIdentities } from './identity';
import type { IdentityRecord } from './types';

function assertNoDuplicate(identities: readonly IdentityRecord[], key: 'resourceId' | 'name' | 'filePath'): void {
  const seen = new Map<string, number>();
  for (const identity of identities) {
    const value = identity[key];
    if (!value) continue;
    const previous = seen.get(value);
    if (previous !== undefined) {
      throw new CliError(`本地状态冲突：${previous}.json 与 ${identity.n}.json 使用同一 ${key}`, 'IDENTITY_CONFLICT');
    }
    seen.set(value, identity.n);
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

/** 解析 `file:N.json`、`id:`、`name:`、`title:` 或无前缀精确选择器。 */
export function resolveIdentity(cwd: string, selector?: string): IdentityRecord {
  const identities = listIdentities(cwd);
  assertNoDuplicate(identities, 'resourceId');
  assertNoDuplicate(identities, 'name');
  assertNoDuplicate(identities, 'filePath');
  if (identities.length === 0) {
    throw new CliError(
      '当前目录没有资源状态。新资源请先 init 后 create；已有资源请 bind <资源 ID|标识符> --artifact <路径>。',
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
