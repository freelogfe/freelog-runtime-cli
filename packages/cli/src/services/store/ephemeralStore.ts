import { createEmptyState, listingFingerprint, resolveCwd } from '../../config/project/index.js';
import type { FreelogState, ResourceProject, VersionProject } from '../../config/project/types.js';
import { getCliEnv } from '../../core/env.js';
import { exportSessionProject } from './exportSessionProject.js';
import type { ProjectStore, ProjectStoreFactoryOpts } from './types.js';

const EMPTY_RESOURCE: ResourceProject = {
  resourceName: '',
  resourceType: [],
};

interface EphemeralMemory {
  resource: ResourceProject;
  version: VersionProject | null;
  state: FreelogState;
}

function cloneResource(resource: ResourceProject): ResourceProject {
  return {
    ...resource,
    resourceType: [...(resource.resourceType || [])],
    coverImages: resource.coverImages ? [...resource.coverImages] : undefined,
    tags: resource.tags ? [...resource.tags] : undefined,
    policies: resource.policies ? [...resource.policies] : undefined,
  };
}

function cloneVersion(version: VersionProject | null): VersionProject | null {
  if (!version) return null;
  return {
    ...version,
    dependencies: version.dependencies ? [...version.dependencies] : undefined,
    baseUpcastResources: version.baseUpcastResources ? [...version.baseUpcastResources] : undefined,
    authExcludedItems: version.authExcludedItems ? [...version.authExcludedItems] : undefined,
    batchSignContracts: version.batchSignContracts ? [...version.batchSignContracts] : undefined,
    inputAttrs: version.inputAttrs ? [...version.inputAttrs] : undefined,
    customPropertyDescriptors: version.customPropertyDescriptors
      ? [...version.customPropertyDescriptors]
      : undefined,
  };
}

/** 会话模式内存 Store；平台事实由 ensureOperationContext lazy fetch，构造时不触网。 */
export class EphemeralStore implements ProjectStore {
  private readonly memory: EphemeralMemory;
  private readonly cwd?: string;

  constructor(opts: ProjectStoreFactoryOpts = {}) {
    this.cwd = opts.cwd;
    const state = createEmptyState('resource');
    state.env = getCliEnv();

    const seededResource: ResourceProject = {
      ...EMPTY_RESOURCE,
      ...opts.seed?.resource,
      ...(opts.resourceId ? { resourceId: opts.resourceId } : {}),
    };

    this.memory = {
      resource: seededResource,
      version: opts.seed?.version
        ? {
            version: opts.seed.version.version ?? '1.0.0',
            filePath: opts.seed.version.filePath ?? '',
            ...opts.seed.version,
          }
        : null,
      state,
    };
  }

  mode() {
    return 'session' as const;
  }

  rootDir() {
    return resolveCwd(this.cwd);
  }

  subject() {
    return 'resource' as const;
  }

  loadResource() {
    return cloneResource(this.memory.resource);
  }

  loadVersion() {
    return cloneVersion(this.memory.version);
  }

  tryLoadVersion() {
    return cloneVersion(this.memory.version);
  }

  loadState() {
    return structuredClone(this.memory.state);
  }

  resolveResourceId() {
    return this.memory.resource.resourceId?.trim() || undefined;
  }

  saveResource(patch: Partial<ResourceProject>) {
    this.memory.resource = { ...this.memory.resource, ...patch };
  }

  saveVersion(patch: Partial<VersionProject>) {
    const current =
      this.memory.version ??
      ({
        version: patch.version ?? '1.0.0',
        filePath: patch.filePath ?? '',
      } satisfies VersionProject);
    this.memory.version = { ...current, ...patch };
  }

  savePlatformFacts(resource: ResourceProject) {
    this.memory.resource = { ...this.memory.resource, ...resource };
    const state = this.memory.state;
    state.resource = {
      ...state.resource,
      resourceId: resource.resourceId || state.resource.resourceId || null,
      resourceName: resource.resourceName || state.resource.resourceName || null,
      resourceType: resource.resourceType || state.resource.resourceType || [],
      resourceTypeCode: resource.resourceTypeCode || state.resource.resourceTypeCode || null,
      resourceTypeName: resource.resourceTypeName || state.resource.resourceTypeName || null,
      owner:
        resource.userId !== undefined || resource.username !== undefined
          ? { userId: resource.userId ?? null, username: resource.username ?? null }
          : state.resource.owner ?? null,
      status: resource.status ?? state.resource.status ?? null,
      latestVersion: resource.latestVersion ?? state.resource.latestVersion ?? null,
      policies: resource.policies ?? state.resource.policies ?? [],
    };
    state.sync = {
      ...state.sync,
      lastPulledAt: new Date().toISOString(),
      listingFingerprint: listingFingerprint(resource),
      platformUpdateDate:
        (resource as { updateDate?: string }).updateDate ?? state.sync.platformUpdateDate ?? null,
    };
  }

  saveVersionFacts(patch: Partial<FreelogState['version']>) {
    this.memory.state.version = { ...this.memory.state.version, ...patch };
  }

  persist() {
    // 会话模式不写盘。
  }

  exportProject(targetDir: string) {
    return exportSessionProject(this, targetDir);
  }

  supportsListingSync() {
    return false;
  }
}
