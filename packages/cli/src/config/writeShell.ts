import path from 'node:path';
import { atomicWriteFile } from './atomicWrite.js';
import { resolveCwd } from './paths.js';

export interface ResourceShell {
  resourceId?: string;
  resourceName: string;
  resourceType: string[];
  resourceTypeCode?: string;
  resourceTitle?: string;
  intro?: string;
  coverImages?: string[];
  tags?: string[];
  userId?: number | string;
  username?: string;
}

export interface DraftSyncMeta {
  /** 最近一次成功 push/pull 后，对规范化 draftData 的指纹 */
  lastFingerprint: string;
  /** 最近一次成功与平台对齐时的远端 updateDate */
  lastRemoteUpdateDate?: string;
  /** 最近一次成功 push 的本地时间 */
  lastPushedAt?: string;
}

export interface VersionDependency {
  resourceId: string;
  resourceName?: string;
  versionRange?: string;
}

export interface BaseUpcastResource {
  resourceId: string;
  resourceName?: string;
}

export interface CustomPropertyDescriptor {
  key: string;
  name?: string;
  type: string;
  defaultValue?: string;
  remark?: string;
  candidateItems?: string[];
}

export interface VersionShell {
  resourceId?: string;
  resourceName?: string;
  resourceType?: string;
  userId?: number | string;
  username?: string;
  version: string;
  description?: string;
  filePath: string;
  /** 平台草稿 / publish 用；不读入 selectedFileInfo 时来自 filePath 上传 */
  fileSha1?: string;
  filename?: string;
  runtimeVersion?: '0.4' | '0.5';
  dependencies?: VersionDependency[];
  baseUpcastResources?: BaseUpcastResource[];
  inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  /** CLI 维护；用户勿手改 */
  draftSync?: DraftSyncMeta | null;
}

function serializeTsModule(exportName: string, data: Record<string, unknown>): string {
  return `export const ${exportName} = ${JSON.stringify(data, null, 2)} as const;\n`;
}

export function writeResourceConfig(
  data: ResourceShell,
  cwd?: string,
  format: 'ts' | 'js' = 'ts',
): string {
  const root = resolveCwd(cwd);
  const file = path.join(root, `freelog.resource.config.${format}`);
  const body =
    format === 'ts'
      ? serializeTsModule('resourceConfig', data as unknown as Record<string, unknown>)
      : `module.exports = ${JSON.stringify(data, null, 2)};\n`;
  atomicWriteFile(file, body);
  return file;
}

export function writeVersionConfig(
  data: VersionShell,
  cwd?: string,
  format: 'ts' | 'js' = 'ts',
): string {
  const root = resolveCwd(cwd);
  const file = path.join(root, `freelog.version.config.${format}`);
  const body =
    format === 'ts'
      ? serializeTsModule('versionConfig', data as unknown as Record<string, unknown>)
      : `module.exports = ${JSON.stringify(data, null, 2)};\n`;
  atomicWriteFile(file, body);
  return file;
}

export type CollectionShell = ResourceShell & {
  collectRules?: unknown;
  catalogueItems?: unknown[];
  /** catalogueProperty 展示设置缓存 */
  display?: Record<string, string>;
  rssFeedUrl?: string;
  /** 合集发版表单草稿意图（非目录草稿） */
  version?: string;
  description?: string;
  draftSync?: DraftSyncMeta | null;
};

export function writeCollectionConfig(
  data: CollectionShell,
  cwd?: string,
  format: 'ts' | 'js' = 'ts',
): string {
  const root = resolveCwd(cwd);
  const file = path.join(root, `freelog.collection.config.${format}`);
  const body =
    format === 'ts'
      ? serializeTsModule('collectionConfig', data as unknown as Record<string, unknown>)
      : `module.exports = ${JSON.stringify(data, null, 2)};\n`;
  atomicWriteFile(file, body);
  return file;
}
