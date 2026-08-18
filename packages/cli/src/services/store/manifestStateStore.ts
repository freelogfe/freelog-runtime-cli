import { cliError } from '../../i18n/cliError.js';
import { isDeepStrictEqual } from 'node:util';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { FreelogState, ResourceProject, VersionProject } from '../../config/project/types.js';
import {
  loadCollectionProject,
  loadResourceProject,
  loadVersionProject,
  mergeProjectPatch,
  tryLoadVersionProject,
  saveCollectionProject,
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

const STORE_PATCH_BASE = Symbol.for('@freelog-cli/store-patch-base');

type PatchBase<T extends object> = T & { [STORE_PATCH_BASE]?: T };

function attachPatchBase<T extends object>(value: T): T {
  Object.defineProperty(value, STORE_PATCH_BASE, {
    value: structuredClone(value),
    enumerable: true,
    configurable: true,
  });
  return value;
}

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

function assertExpectedFields<T extends object>(
  current: T,
  expected: Partial<T> | undefined,
  patch: Partial<T>,
): void {
  if (!expected) return;
  const conflicts = (Object.keys(expected) as Array<keyof T>).filter(
    (key) =>
      !isDeepStrictEqual(current[key], expected[key]) &&
      !isDeepStrictEqual(current[key], patch[key]),
  );
  if (!conflicts.length) return;
  throw cliError(I18N_KEYS.project_revision_conflict, {
    code: 3,
    details: { error: 'REMOTE_WRITE_LOCAL_CONFLICT', conflictingFields: conflicts.map(String) },
    hint: '平台写入已完成，但对应本地字段已变化；请保留当前修改并重试，CLI 会先对账平台状态',
  });
}

function assertExpectedBinding(currentResourceId: string | undefined, expectedResourceId?: string): void {
  if (!expectedResourceId || currentResourceId?.trim() === expectedResourceId.trim()) return;
  throw cliError(I18N_KEYS.project_revision_conflict, {
    code: 3,
    details: {
      error: 'REMOTE_WRITE_BINDING_CONFLICT',
      currentResourceId,
      expectedResourceId,
    },
    hint: '平台写入已完成，但当前目录绑定已变化；请保留现场并人工核对',
  });
}

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

type CollectionProject = ReturnType<typeof loadCollectionProject>['data'];

export function saveCollectionProjectPatch(
  patch: Partial<CollectionProject>,
  cwd?: string,
  options: { expected?: Partial<CollectionProject>; expectedResourceId?: string } = {},
): void {
  withProjectWriteLock(cwd, () => {
    const current = loadCollectionProject(cwd).data;
    assertExpectedBinding(current.resourceId, options.expectedResourceId);
    assertExpectedFields(current, options.expected, patch);
    saveCollectionProject(mergeProjectPatch(current, patch), cwd);
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

  loadResource() {
    return attachPatchBase(loadResourceProject(this.cwd).data);
  }

  loadVersion() {
    return attachPatchBase(loadVersionProject(this.cwd).data);
  }

  tryLoadVersion() {
    const loaded = tryLoadVersionProject(this.cwd)?.data;
    return loaded ? attachPatchBase(loaded) : null;
  }

  loadState() {
    return loadState(this.cwd, 'resource').data;
  }

  resolveResourceId() {
    return this.loadResource().resourceId?.trim() || undefined;
  }

  saveResource(patch: Partial<ResourceProject>) {
    withProjectWriteLock(this.cwd, () => {
      const current = this.loadResource();
      saveResourceProject(mergeIntentPatch(current, patch), this.cwd);
    });
  }

  saveVersion(patch: Partial<VersionProject>) {
    withProjectWriteLock(this.cwd, () => {
      const current = this.loadVersion();
      saveVersionProject(mergeIntentPatch(current, patch), this.cwd);
    });
  }

  savePublishedVersion(
    patch: Partial<VersionProject>,
    expectedIntent: Partial<VersionProject>,
    expectedResourceId: string,
  ) {
    saveVersionProjectPatch(patch, this.cwd, {
      expected: expectedIntent,
      expectedResourceId,
    });
  }

  savePlatformFacts(resource: ResourceProject, options?: SavePlatformFactsOptions) {
    savePlatformResourceState(resource, this.cwd, 'resource', options);
  }

  saveVersionFacts(patch: Partial<FreelogState['version']>) {
    updateState(this.cwd, 'resource', (state) => {
      state.version = { ...state.version, ...patch };
    });
  }

  persist() {
    // 工程模式：save* 已原子写 manifest/state；显式 persist 为 no-op。
  }

  exportProject(_targetDir: string): string {
    throw cliError(I18N_KEYS.export_project_session_only, { code: 4 });
  }

  supportsListingSync() {
    return true;
  }
}
