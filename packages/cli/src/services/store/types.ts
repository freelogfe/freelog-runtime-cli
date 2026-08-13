import type { FreelogState, ResourceProject, VersionProject } from '../../config/project/types.js';

export type ProjectMode = 'project' | 'session';

export interface ProjectStore {
  mode(): ProjectMode;
  rootDir(): string;
  subject(): 'resource';
  loadResource(): ResourceProject;
  loadVersion(): VersionProject | null;
  tryLoadVersion(): VersionProject | null;
  loadState(): FreelogState;
  resolveResourceId(): string | undefined;
  saveResource(patch: Partial<ResourceProject>): void;
  saveVersion(patch: Partial<VersionProject>): void;
  savePlatformFacts(resource: ResourceProject): void;
  saveVersionFacts(patch: Partial<FreelogState['version']>): void;
  persist(): void;
  exportProject(targetDir: string): void;
  supportsListingSync(): boolean;
}

export interface ProjectStoreFactoryOpts {
  cwd?: string;
  session?: boolean;
  resourceId?: string;
  seed?: {
    resource?: Partial<ResourceProject>;
    version?: Partial<VersionProject>;
  };
}
