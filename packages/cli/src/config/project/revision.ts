import { createHash } from 'node:crypto';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { FreelogManifest, FreelogState } from './types.js';

/**
 * 工程快照的乐观并发控制。
 *
 * revision 只挂在内存 DTO 的 Symbol 上，不会落入 manifest/state。保存时用它判断调用方是否
 * 基于过期快照写入；mergeProjectPatch 则确保 fresh snapshot 的 revision 不会被 stale patch 带回。
 */
const PROJECT_REVISION = Symbol.for('@freelog-cli/project-revision');

function projectRevision(manifest: FreelogManifest, state: FreelogState): string {
  return createHash('sha256').update(JSON.stringify([manifest, state])).digest('hex');
}

/**
 * 把当前 manifest/state 的 SHA-256 快照绑定到内存 DTO。
 * revision 使用不可序列化语义上的 Symbol 字段，仅服务于保存前的并发检测，不会写入 JSON。
 */
export function attachProjectRevision<T extends object>(
  data: T,
  manifest: FreelogManifest,
  state: FreelogState,
): T {
  Object.defineProperty(data, PROJECT_REVISION, {
    value: projectRevision(manifest, state),
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return data;
}

/**
 * 在普通保存入口校验 DTO 是否仍基于当前磁盘快照。
 * 缺少 revision 的对象只代表未绑定快照，不在此函数中自动猜测或覆盖并发变化。
 */
export function assertProjectRevision(
  data: object,
  manifest: FreelogManifest,
  state: FreelogState,
): void {
  const expected = (data as Record<symbol, unknown>)[PROJECT_REVISION];
  const actual = projectRevision(manifest, state);
  if (typeof expected !== 'string' || expected === actual) return;
  throw cliError(I18N_KEYS.project_revision_conflict, {
    code: 3,
    details: { expectedRevision: expected, actualRevision: actual },
    hint: '请重新读取项目状态、合并本地意图后重试',
  });
}

/** 合并 patch 时只继承 fresh snapshot 的 revision，不允许 stale patch 带回旧 revision。 */
export function mergeProjectPatch<T extends object>(current: T, patch: Partial<T>): T {
  const merged = { ...current, ...patch };
  const revision = (current as Record<symbol, unknown>)[PROJECT_REVISION];
  if (typeof revision === 'string') {
    Object.defineProperty(merged, PROJECT_REVISION, {
      value: revision,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return merged;
}
