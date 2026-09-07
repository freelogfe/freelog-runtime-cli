/** 对照 ARCHITECTURE/02-本地状态 §2.2。磁盘上未写 env = prod。 */

export type FreelogEnv = 'prod' | 'test' | 'dev';

export type IdentitySubject = 'resource';

/** `N.json` 允许落盘的字段。`env` 仅非 prod。 */
export type ResourceIdentity = {
  subject: IdentitySubject;
  resourceId?: string;
  name: string;
  typeCode: string;
  filePath?: string;
  env?: Exclude<FreelogEnv, 'prod'>;
};

/** 写入入参。`env: prod` 会被丢掉，不落盘。 */
export type IdentityWriteInput = {
  subject: IdentitySubject;
  resourceId?: string;
  name: string;
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

/** `N.version.json`：还没 POST 的下一版。对照 02 §2.2。 */
export type VersionDraft = {
  fromVersion?: string;
  fileSha1?: string;
  filename?: string;
  description?: string;
  inputAttrs?: Record<string, unknown>[];
  customPropertyDescriptors?: Record<string, unknown>[];
  dependencies?: Record<string, unknown>[];
  baseUpcastResources: [];
  authExcludedItems: [];
};
