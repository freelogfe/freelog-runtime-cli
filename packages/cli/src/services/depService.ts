import { CliError } from '../core/errors.js';
import { loadVersionConfig, saveVersionConfig } from '../config/read.js';
import type { VersionDependency } from '../config/writeShell.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { ensureSynced } from './syncService.js';

/** 本地依赖意图；不调平台；不改 draftSync */
export async function depAdd(opts: {
  cwd?: string;
  resourceId: string;
  versionRange?: string;
  resourceName?: string;
  noAutoPull?: boolean;
}) {
  if (!opts.resourceId?.trim()) {
    throw new CliError('缺少依赖 resourceId', { code: 4 });
  }
  await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const { data } = loadVersionConfig(opts.cwd);
  const deps = [...(data.dependencies || [])];
  const idx = deps.findIndex((d) => d.resourceId === opts.resourceId);
  const item: VersionDependency = {
    resourceId: opts.resourceId.trim(),
    versionRange: opts.versionRange || '*',
    resourceName: opts.resourceName,
  };
  if (idx >= 0) deps[idx] = { ...deps[idx], ...item };
  else deps.push(item);
  saveVersionConfig({ ...data, dependencies: deps }, opts.cwd);
  return deps;
}

export async function depRemove(opts: {
  cwd?: string;
  resourceId: string;
  noAutoPull?: boolean;
}) {
  await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const { data } = loadVersionConfig(opts.cwd);
  const before = data.dependencies || [];
  const deps = before.filter((d) => d.resourceId !== opts.resourceId);
  if (deps.length === before.length) {
    throw new CliError(`未找到依赖 ${opts.resourceId}`, { code: 4 });
  }
  saveVersionConfig({ ...data, dependencies: deps }, opts.cwd);
  return deps;
}

export async function depUpdate(opts: {
  cwd?: string;
  resourceId: string;
  versionRange: string;
  noAutoPull?: boolean;
}) {
  if (!opts.versionRange?.trim()) {
    throw new CliError('缺少 -v / --version-range', { code: 4 });
  }
  await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const { data } = loadVersionConfig(opts.cwd);
  const deps = [...(data.dependencies || [])];
  const idx = deps.findIndex((d) => d.resourceId === opts.resourceId);
  if (idx < 0) throw new CliError(`未找到依赖 ${opts.resourceId}`, { code: 4 });
  deps[idx] = { ...deps[idx], versionRange: opts.versionRange };
  saveVersionConfig({ ...data, dependencies: deps }, opts.cwd);
  return deps;
}

export async function depList(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  tree?: boolean;
}) {
  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const { data } = loadVersionConfig(opts.cwd);
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
    throw new CliError('无法读取平台依赖树', {
      code: 1,
      details: { cause: error instanceof Error ? error.message : String(error) },
      hint: '确认资源已有正式版本，或先 publish',
    });
  }
}
