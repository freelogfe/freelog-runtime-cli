import { isDeepStrictEqual } from 'node:util';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { FreelogState, ResourceProject, VersionProject } from '../../config/project/types.js';
import {
  loadResourceProject,
  loadVersionProject,
  mergeProjectPatch,
  tryLoadVersionProject,
  saveResourceProject,
  savePlatformResourceState,
  saveVersionProject,
} from '../../config/project/projects.js';
import {
  loadState,
  resolveCwd,
  updateState,
  withProjectWriteLock,
} from '../../config/project/store.js';
import type { ProjectStore, SavePlatformFactsOptions } from './types.js';
import { assertExpectedBinding, assertExpectedFields } from './remoteWriteGuards.js';
export { saveCollectionProjectPatch } from './collectionStorePatch.js';

/**
 * 工程模式 ProjectStore：load 返回值携带读取基线，save 只提取相对基线真正变化的字段，
 * 再与最新磁盘快照做三方合并。无关并发修改被保留，同字段双写明确冲突；平台写后的
 * expected 校验还会阻止把旧远端结果标记到新意图上。
 */
const STORE_PATCH_BASE = Symbol.for('@freelog-cli/store-patch-base');

type PatchBase<T extends object> = T & { [STORE_PATCH_BASE]?: T };

/**
 * 读取结果携带不可序列化的读取基线。它只用于同一 DTO 随后的 save* 三方合并：JSON 和 manifest/state
 * 永远看不到这份 metadata，调用方可以像普通 DTO 一样 spread 后再保存。
 */
function attachPatchBase<T extends object>(value: T): T {
  Object.defineProperty(value, STORE_PATCH_BASE, {
    value: structuredClone(value),
    enumerable: true,
    configurable: true,
  });
  return value;
}

/**
 * 三方合并 = 读取基线 / 当前磁盘值 / 调用方意图。只写入相对基线真正改变的字段；同一字段被其他
 * 进程改成第三个值时必须冲突，不能以最后写入者获胜掩盖用户意图。
 */
function mergeIntentPatch<T extends object>(current: T, patch: Partial<T>): T {
  const base = (patch as PatchBase<T>)[STORE_PATCH_BASE];
  if (!base) return mergeProjectPatch(current, patch);

  const intended: Partial<T> = {};
  const conflicts: string[] = [];
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const incoming = patch[key];
    const previous = base[key];
    if (isDeepStrictEqual(incoming, previous)) continue;
    const fresh = current[key];
    if (!isDeepStrictEqual(fresh, previous) && !isDeepStrictEqual(fresh, incoming)) {
      conflicts.push(String(key));
      continue;
    }
    intended[key] = incoming;
  }
  if (conflicts.length) {
    throw cliError(I18N_KEYS.project_revision_conflict, {
      code: 3,
      details: { conflictingFields: conflicts },
      hint: '这些字段已被其他进程修改；请重新读取后合并本地意图',
    });
  }
  return mergeProjectPatch(current, intended);
}

/**
 * 发布/远端写后的最小版本补丁。expected 约束的是本次远端请求实际使用的不可变发布意图；
 * expectedResourceId 约束的是目录绑定。两者任一变化都不能把旧平台结果标记到新本地配置。
 */
export function saveVersionProjectPatch(
  patch: Partial<VersionProject>,
  cwd?: string,
  options: { expected?: Partial<VersionProject>; expectedResourceId?: string } = {},
): void {
  withProjectWriteLock(cwd, () => {
    const current = loadVersionProject(cwd).data;
    assertExpectedBinding(current.resourceId, options.expectedResourceId);
    assertExpectedFields(current, options.expected, patch);
    saveVersionProject(mergeProjectPatch(current, patch), cwd);
  });
}

export class ManifestStateStore implements ProjectStore {
  constructor(private readonly cwd?: string) {}

  mode() {
    return 'project' as const;
  }

  rootDir() {
    return resolveCwd(this.cwd);
  }

  subject() {
    return 'resource' as const;
  }

  /** 读取资源工程，并附带本次读取基线供后续三方合并。 */
  loadResource() {
    return attachPatchBase(loadResourceProject(this.cwd).data);
  }

  /** 读取版本意图与平台事实，返回值可直接 spread 后交给 saveVersion。 */
  loadVersion() {
    return attachPatchBase(loadVersionProject(this.cwd).data);
  }

  /** 可选读取版本工程；没有资源版本时返回 null，损坏工程仍然抛出。 */
  tryLoadVersion() {
    const loaded = tryLoadVersionProject(this.cwd)?.data;
    return loaded ? attachPatchBase(loaded) : null;
  }

  /** 读取资源 state；调用方不应把其中平台事实当作用户意图写回 manifest。 */
  loadState() {
    return loadState(this.cwd, 'resource').data;
  }

  /** 返回当前工程绑定的 resourceId；未绑定时返回 undefined。 */
  resolveResourceId() {
    return this.loadResource().resourceId?.trim() || undefined;
  }

  /** 三方合并资源意图 patch；无关并发修改保留，同字段冲突返回 code 3。 */
  saveResource(patch: Partial<ResourceProject>) {
    withProjectWriteLock(this.cwd, () => {
      const current = this.loadResource();
      saveResourceProject(mergeIntentPatch(current, patch), this.cwd);
    });
  }

  /** 三方合并版本意图 patch；不会把平台发布事实当成本地意图覆盖。 */
  saveVersion(patch: Partial<VersionProject>) {
    withProjectWriteLock(this.cwd, () => {
      const current = this.loadVersion();
      saveVersionProject(mergeIntentPatch(current, patch), this.cwd);
    });
  }

  /** createVersion 已确认成功后的受保护写回；同时验证完整发布意图和目录绑定。 */
  savePublishedVersion(
    patch: Partial<VersionProject>,
    expectedIntent: Partial<VersionProject>,
    expectedResourceId: string,
  ) {
    // createVersion 已成功时同时校验发布输入和目录绑定，不能只补写 published=true。
    saveVersionProjectPatch(patch, this.cwd, {
      expected: expectedIntent,
      expectedResourceId,
    });
  }

  /** 合并平台 listing/status/policy 等事实；远端成功路径必须显式传 remoteWriteConfirmed。 */
  savePlatformFacts(resource: ResourceProject, options?: SavePlatformFactsOptions) {
    savePlatformResourceState(resource, this.cwd, 'resource', options);
  }

  /** 只更新 state.version 平台事实，不触碰 manifest.version 用户意图。 */
  saveVersionFacts(patch: Partial<FreelogState['version']>) {
    updateState(this.cwd, 'resource', (state) => {
      state.version = { ...state.version, ...patch };
    });
  }

  /** 工程模式的各个 save 已立即持久化；此接口为 ProjectStore 兼容 no-op。 */
  persist() {
    // 工程模式：save* 已原子写 manifest/state；显式 persist 为 no-op。
  }

  /** 工程模式禁止反向 export；export 只属于 EphemeralStore 的显式动作。 */
  exportProject(_targetDir: string): string {
    throw cliError(I18N_KEYS.export_project_session_only, { code: 4 });
  }

  /** 工程模式允许 listing 漂移对账；session 模式由 EphemeralStore 返回 false。 */
  supportsListingSync() {
    return true;
  }
}
