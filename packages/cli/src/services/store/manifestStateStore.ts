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
    return loadResourceProject(this.cwd).data;
  }

  loadVersion() {
    return loadVersionProject(this.cwd).data;
  }

  tryLoadVersion() {
    return tryLoadVersionProject(this.cwd)?.data ?? null;
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
      saveResourceProject(mergeProjectPatch(current, patch), this.cwd);
    });
  }

  saveVersion(patch: Partial<VersionProject>) {
    withProjectWriteLock(this.cwd, () => {
      const current = this.loadVersion();
      saveVersionProject(mergeProjectPatch(current, patch), this.cwd);
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
