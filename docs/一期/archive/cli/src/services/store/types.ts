import type { FreelogState, ResourceProject, VersionProject } from '../../config/project/types.js';

export type ProjectMode = 'project' | 'session';

export interface SavePlatformFactsOptions {
  /** 平台副作用已确认；实现只能合并平台字段，仍须校验当前目录绑定。 */
  remoteWriteConfirmed?: boolean;
}

/**
 * service 与持久化之间的端口。业务用例只依赖此接口，才能同时支持工程模式与 session。
 * save* 接收 patch，不代表 last-writer-wins：具体实现必须保留并发无关修改并拒绝同字段冲突。
 */
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
  savePublishedVersion(
    patch: Partial<VersionProject>,
    expectedIntent: Partial<VersionProject>,
    expectedResourceId: string,
  ): void;
  savePlatformFacts(resource: ResourceProject, options?: SavePlatformFactsOptions): void;
  saveVersionFacts(patch: Partial<FreelogState['version']>): void;
  persist(): void;
  exportProject(targetDir: string): string;
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
