/** 对照 ARCHITECTURE/02-本地状态 §2.2。磁盘上未写 env = prod。 */

export type FreelogEnv = 'prod' | 'test' | 'dev';

export type IdentitySubject = 'resource' | 'collection';

/** `N.json` 允许落盘的字段。未绑定立项不含 name/resourceId/title/env。 */
type IdentityBase = {
  schemaVersion: 1;
  subject: IdentitySubject;
  /** 工作稿只允许在资源创建或 bind 完成后存在，因此始终快照资源 id。 */
  resourceId?: string;
  /** 平台完整资源标识；绑定后写入，供稳定的 `name:` 身份选择使用。 */
  resourceName?: string;
  /** 完整标识的末段，仅供展示和兼容读取，不能单独作为身份选择依据。 */
  name?: string;
  /** 可重复、可过期的展示缓存，不是资源身份。 */
  title?: string;
  typeCode: string;
  env?: Exclude<FreelogEnv, 'prod'>;
};

/** 单资源身份始终关联本地产物。 */
export type ResourceIdentity = IdentityBase & {
  subject: 'resource';
  /** 每份资源状态的本地产物锚点；普通资源=文件，主题/插件=文件或构建目录。 */
  filePath: string;
};

/** 合集是线上目录主体，不关联本地文件或构建目录。 */
export type CollectionIdentity = IdentityBase & {
  subject: 'collection';
  filePath?: never;
};

/** 写入入参。`env: prod` 会被丢掉，不落盘。 */
export type ResourceIdentityWriteInput = {
  subject: 'resource';
  resourceId?: string;
  resourceName?: string;
  name?: string;
  title?: string;
  typeCode: string;
  filePath: string;
  env?: FreelogEnv;
};

export type CollectionIdentityWriteInput = {
  subject: 'collection';
  resourceId?: string;
  resourceName?: string;
  name?: string;
  title?: string;
  typeCode: string;
  env?: FreelogEnv;
};

export type IdentityWriteInput = ResourceIdentityWriteInput | CollectionIdentityWriteInput;

/** 编号来自文件名，不是 `N.json` 字段。 */
export type IdentityRecord = ResourceIdentity & {
  n: number;
};

export type CollectionIdentityRecord = CollectionIdentity & {
  n: number;
};

export type AnyIdentity = ResourceIdentity | CollectionIdentity;
export type AnyIdentityRecord = IdentityRecord | CollectionIdentityRecord;

/**
 * `N.version.json` 的 v1 形状。字段在类型中保留 optional 是为了让各表单以 patch 调用
 * `writeDraft`；落盘和 `readDraft` 始终将其规范化为完整 v1 工作稿。
 */
export type VersionDraft = {
  schemaVersion?: 1;
  draftKind?: 'initial' | 'update';
  resourceId?: string;
  resourceTypeCode?: string;
  fromVersion?: string;
  fileSha1?: string | null;
  filename?: string | null;
  analyzedSha1?: string | null;
  description?: string;
  inputAttrs?: Record<string, unknown>[];
  orphanedInputAttrs?: Record<string, unknown>[];
  customPropertyDescriptors?: Record<string, unknown>[];
  dependencies?: Record<string, unknown>[];
  baseUpcastResources: never[];
  authExcludedItems: never[];
};
