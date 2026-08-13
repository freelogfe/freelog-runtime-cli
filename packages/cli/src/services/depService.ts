import type { VersionDependency } from '../config/project.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { ensureSynced } from './sync/index.js';
import { requireVersionProject } from './store/requireVersion.js';
import type { ProjectStore } from './store/types.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { assertValidVersionRange } from './validation.js';
import { resolveDefaultDepVersionRange } from './depVersionRange.js';

/** 修改本地下一版依赖意图；平台草稿同步由 draft 命令显式执行。 */
export async function depAdd(opts: {
  store: ProjectStore;
  resourceId: string;
  versionRange?: string;
  resourceName?: string;
  noAutoPull?: boolean;
}) {
  if (!opts.resourceId?.trim()) {
    throw cliError(I18N_KEYS.missing_dep_resource_id, { code: 4 });
  }
  const versionRange = await resolveDefaultDepVersionRange({
    resourceId: opts.resourceId,
    versionRange: opts.versionRange,
  });
  assertValidVersionRange(versionRange);
  const store = opts.store;
  await ensureSynced({ store, noAutoPull: opts.noAutoPull });
  const data = requireVersionProject(store);
  const deps = [...(data.dependencies || [])];
  const idx = deps.findIndex((d) => d.resourceId === opts.resourceId);
  const item: VersionDependency = {
    resourceId: opts.resourceId.trim(),
    versionRange,
    resourceName: opts.resourceName,
  };
  if (idx >= 0) deps[idx] = { ...deps[idx], ...item };
  else deps.push(item);
  store.saveVersion({ ...data, dependencies: deps });
  return deps;
}

export async function depRemove(opts: {
  store: ProjectStore;
  resourceId: string;
  noAutoPull?: boolean;
}) {
  const store = opts.store;
  await ensureSynced({ store, noAutoPull: opts.noAutoPull });
  const data = requireVersionProject(store);
  const before = data.dependencies || [];
  const deps = before.filter((d) => d.resourceId !== opts.resourceId);
  if (deps.length === before.length) {
    throw cliError(I18N_KEYS.dep_not_found, {
      code: 4,
      params: { resourceId: opts.resourceId },
    });
  }
  store.saveVersion({ ...data, dependencies: deps });
  return deps;
}

export async function depUpdate(opts: {
  store: ProjectStore;
  resourceId: string;
  versionRange: string;
  noAutoPull?: boolean;
}) {
  if (!opts.versionRange?.trim()) {
    throw cliError(I18N_KEYS.missing_version_range, { code: 4 });
  }
  assertValidVersionRange(opts.versionRange);
  const store = opts.store;
  await ensureSynced({ store, noAutoPull: opts.noAutoPull });
  const data = requireVersionProject(store);
  const deps = [...(data.dependencies || [])];
  const idx = deps.findIndex((d) => d.resourceId === opts.resourceId);
  if (idx < 0) {
    throw cliError(I18N_KEYS.dep_not_found, {
      code: 4,
      params: { resourceId: opts.resourceId },
    });
  }
  deps[idx] = { ...deps[idx], versionRange: opts.versionRange };
  store.saveVersion({ ...data, dependencies: deps });
  return deps;
}

export async function depList(opts: {
  store: ProjectStore;
  noAutoPull?: boolean;
  tree?: boolean;
}) {
  const store = opts.store;
  const ctx = await ensureSynced({ store, noAutoPull: opts.noAutoPull });
  const data = requireVersionProject(store);
  const local = data.dependencies || [];

  if (!opts.tree) return { local, tree: null as unknown };

  const resourceId = ctx.resource.resourceId!;
  const version = data.version || ctx.info.latestVersion;
  try {
    const envelope = await FServiceAPI.Resource.dependencyTree({
      resourceId,
      version,
      isContainRootNode: true,
    } as Parameters<typeof FServiceAPI.Resource.dependencyTree>[0]);
    const tree = unwrapData(envelope);
    return { local, tree };
  } catch (error) {
    throw cliError(I18N_KEYS.dep_tree_unreadable, {
      code: 1,
      details: { cause: error instanceof Error ? error.message : String(error) },
      hint: '请确认资源已绑定且版本已发布，然后重试',
    });
  }
}
