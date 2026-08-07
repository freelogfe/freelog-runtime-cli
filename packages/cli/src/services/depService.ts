import { CliError } from '../core/errors.js';
import { loadVersionProject, saveVersionProject } from '../config/project.js';
import type { VersionDependency } from '../config/project.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { ensureSynced } from './sync/index.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { assertValidVersionRange } from './validation.js';

/** ?????????????? draftSync */
export async function depAdd(opts: {
  cwd?: string;
  resourceId: string;
  versionRange?: string;
  resourceName?: string;
  noAutoPull?: boolean;
}) {
  if (!opts.resourceId?.trim()) {
    throw cliError(I18N_KEYS.missing_dep_resource_id, { code: 4 });
  }
  const versionRange = opts.versionRange || '*';
  assertValidVersionRange(versionRange);
  await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const { data } = loadVersionProject(opts.cwd);
  const deps = [...(data.dependencies || [])];
  const idx = deps.findIndex((d) => d.resourceId === opts.resourceId);
  const item: VersionDependency = {
    resourceId: opts.resourceId.trim(),
    versionRange,
    resourceName: opts.resourceName,
  };
  if (idx >= 0) deps[idx] = { ...deps[idx], ...item };
  else deps.push(item);
  saveVersionProject({ ...data, dependencies: deps }, opts.cwd);
  return deps;
}

export async function depRemove(opts: {
  cwd?: string;
  resourceId: string;
  noAutoPull?: boolean;
}) {
  await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const { data } = loadVersionProject(opts.cwd);
  const before = data.dependencies || [];
  const deps = before.filter((d) => d.resourceId !== opts.resourceId);
  if (deps.length === before.length) {
    throw cliError(I18N_KEYS.dep_not_found, {
      code: 4,
      params: { resourceId: opts.resourceId },
    });
  }
  saveVersionProject({ ...data, dependencies: deps }, opts.cwd);
  return deps;
}

export async function depUpdate(opts: {
  cwd?: string;
  resourceId: string;
  versionRange: string;
  noAutoPull?: boolean;
}) {
  if (!opts.versionRange?.trim()) {
    throw cliError(I18N_KEYS.missing_version_range, { code: 4 });
  }
  assertValidVersionRange(opts.versionRange);
  await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const { data } = loadVersionProject(opts.cwd);
  const deps = [...(data.dependencies || [])];
  const idx = deps.findIndex((d) => d.resourceId === opts.resourceId);
  if (idx < 0) {
    throw cliError(I18N_KEYS.dep_not_found, {
      code: 4,
      params: { resourceId: opts.resourceId },
    });
  }
  deps[idx] = { ...deps[idx], versionRange: opts.versionRange };
  saveVersionProject({ ...data, dependencies: deps }, opts.cwd);
  return deps;
}

export async function depList(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  tree?: boolean;
}) {
  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const { data } = loadVersionProject(opts.cwd);
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
      hint: '????????????? publish',
    });
  }
}
