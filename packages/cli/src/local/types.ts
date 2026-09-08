/** 对照 ARCHITECTURE/02-本地状态 §2.2。磁盘上未写 env = prod。 */

export type FreelogEnv = 'prod' | 'test' | 'dev';

export type IdentitySubject = 'resource';

/** `N.json` 允许落盘的字段。未绑定立项不含 name/resourceId/env。 */
export type ResourceIdentity = {
  schemaVersion: 1;
  subject: IdentitySubject;
  /** 工作稿只允许在资源创建或 bind 完成后存在，因此始终快照资源 id。 */
  resourceId?: string;
  name?: string;
  typeCode: string;
  filePath?: string;
  env?: Exclude<FreelogEnv, 'prod'>;
};

/** 写入入参。`env: prod` 会被丢掉，不落盘。 */
export type IdentityWriteInput = {
  subject: IdentitySubject;
  resourceId?: string;
  name?: string;
  typeCode: string;
  filePath?: string;
  env?: FreelogEnv;
};

/** 编号来自文件名，不是 `N.json` 字段。 */
export type IdentityRecord = ResourceIdentity & {
  n: number;
};

/** `index.json`：路径 → 编号。不是主本，和 `N.json` 打架听 `N.json`。 */
export type IdentityIndex = Record<string, number>;

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
