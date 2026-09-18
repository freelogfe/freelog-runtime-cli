import {
  loadCollectionProject,
  loadState,
  saveCollectionProject,
  savePlatformCollectionState,
  tryLoadCollectionProject,
  type CollectionProject,
  type FreelogState,
} from '../../config/project.js';
import { saveCollectionProjectPatch } from './collectionStorePatch.js';

export interface CollectionPlatformStateUpdates {
  catalogueDraft?: unknown[] | null;
  catalogueProperty?: Record<string, string> | null;
  cataloguePublishedFingerprint?: string | null;
  collectRules?: unknown;
  rss?: FreelogState['collection']['rss'];
}

export interface CollectionStoreWriteOptions {
  remoteWriteConfirmed?: boolean;
}

/**
 * 合集工程的持久化端口。合集尚不支持 session Store，因此该端口只表达工程模式；
 * service 不再需要知道 manifest/state 的双文件细节，底层实现仍复用同一事务、锁和 revision。
 */
export interface CollectionStore {
  rootDir(): string;
  load(): CollectionProject;
  tryLoad(): CollectionProject | null;
  loadState(): FreelogState;
  save(data: CollectionProject): void;
  savePatch(
    patch: Partial<CollectionProject>,
    options?: { expected?: Partial<CollectionProject>; expectedResourceId?: string },
  ): void;
  savePlatformFacts(
    data: CollectionProject,
    updates?: CollectionPlatformStateUpdates,
    options?: CollectionStoreWriteOptions,
  ): void;
}

export class ManifestCollectionStore implements CollectionStore {
  /** 创建工程模式合集 Store；cwd 只作为解析基准，不在构造时读盘。 */
  constructor(private readonly cwd?: string) {}

  /** 返回合集工程根目录。 */
  rootDir(): string {
    return this.cwd || process.cwd();
  }

  /** 读取并返回合集 DTO；损坏/subject 错误会抛出而不是当作新合集。 */
  load(): CollectionProject {
    return loadCollectionProject(this.cwd).data;
  }

  /** 尝试读取合集 DTO；仅 manifest 不存在返回 null。 */
  tryLoad(): CollectionProject | null {
    return tryLoadCollectionProject(this.cwd)?.data || null;
  }

  /** 读取合集平台事实 state，供平台同步与恢复使用。 */
  loadState(): FreelogState {
    return loadState(this.cwd, 'collection').data;
  }

  /** 保存完整合集意图/事实快照；成对提交由底层 project transaction 保证。 */
  save(data: CollectionProject): void {
    saveCollectionProject(data, this.cwd);
  }

  /** 对合集意图做三方 patch 合并；无关并发保留，同字段冲突显式失败。 */
  savePatch(
    patch: Partial<CollectionProject>,
    options: { expected?: Partial<CollectionProject>; expectedResourceId?: string } = {},
  ): void {
    saveCollectionProjectPatch(patch, this.cwd, options);
  }

  /** 写入合集平台事实；可选 expected/remoteWriteConfirmed 防止旧结果错绑到新意图。 */
  savePlatformFacts(
    data: CollectionProject,
    updates: CollectionPlatformStateUpdates = {},
    options: CollectionStoreWriteOptions = {},
  ): void {
    savePlatformCollectionState(data, this.cwd, updates, options);
  }
}

/** 从 cwd 创建合集持久化端口；便于 service 注入而不依赖具体文件布局。 */
export function collectionStoreFromCwd(cwd?: string): CollectionStore {
  return new ManifestCollectionStore(cwd);
}
