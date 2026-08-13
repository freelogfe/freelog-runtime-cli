import { EphemeralStore } from './ephemeralStore.js';
import { ManifestStateStore } from './manifestStateStore.js';
import type { ProjectStore, ProjectStoreFactoryOpts } from './types.js';

export type { ProjectMode, ProjectStore, ProjectStoreFactoryOpts } from './types.js';

export function createProjectStore(opts: ProjectStoreFactoryOpts = {}): ProjectStore {
  if (opts.session) {
    return new EphemeralStore(opts);
  }
  return new ManifestStateStore(opts.cwd);
}

/** 工程模式 Store；由命令层注入 service。 */
export function projectStoreFromCwd(cwd?: string): ProjectStore {
  return new ManifestStateStore(cwd);
}
