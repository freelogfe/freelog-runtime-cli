/** 合集建壳：仅创建 subjectType=4 身份，不上传文件、不创建目录项或发布快照。 */

import { CliError } from '../../core/errors';
import { askInput, confirmWrite, isInteractive } from '../../core/tty';
import { createCollectionIdentity } from '../../local/identity';
import type { CollectionIdentityRecord } from '../../local/types';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed, getEnv, type FreelogEnv } from '../env';
import { chooseCollectionLeafType, getCollectionTypeInfo, type CollectionTypeApis } from './typePick';

export type CollectionCreateApis = CollectionTypeApis & {
  create?: (params: Record<string, unknown>) => Promise<unknown>;
  info?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  const value = result as { data?: Record<string, unknown> };
  return value.data ?? (result as Record<string, unknown>);
}

function isNotFound(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown }; status?: unknown }).response?.status
    ?? (error as { status?: unknown }).status;
  return Number(status) === 404;
}

/** 与单资源相同的短标识规范化，但在合集领域独立保留，避免反向耦合。 */
export function normalizeCollectionName(raw: string): string {
  return raw.replace(/[\s\\/:*?"<>|@$#]/gu, '_').replace(/\p{Extended_Pictographic}/gu, '_').slice(0, 60);
}

function validateTitle(value: string | undefined): string {
  const title = value?.trim() ?? '';
  if (!title) throw new CliError('请输入合集标题', 'COLLECTION_TITLE_REQUIRED');
  if (title.length > 100) throw new CliError('合集标题不超过100个字符', 'COLLECTION_TITLE_TOO_LONG');
  return title;
}

function validateName(value: string | undefined): string {
  const raw = value?.trim() ?? '';
  if (raw.includes('/')) throw new CliError('合集授权标识只传短段，不要带 username/', 'COLLECTION_NAME_SLASH');
  const name = normalizeCollectionName(raw);
  if (!name) throw new CliError('请提供合集授权标识', 'COLLECTION_NAME_REQUIRED');
  return name;
}

async function chooseInputs(input: {
  title?: string;
  name?: string;
  type?: string;
  yes?: boolean;
  apis: CollectionTypeApis;
}): Promise<{ title: string; name: string; typeCode: string }> {
  if (input.yes && (!input.title || !input.name || !input.type)) {
    throw new CliError('--yes 必须同时提供 --type / --title / --name', 'COLLECTION_CREATE_YES_FLAGS');
  }
  const title = validateTitle(input.title ?? (isInteractive() ? await askInput('合集标题') : undefined));
  const suggestedName = normalizeCollectionName(title);
  const name = validateName(input.name ?? (isInteractive()
    ? (await askInput(`合集授权标识（默认：${suggestedName}）`)).trim() || suggestedName
    : undefined));
  const typeCode = input.type
    ? (await getCollectionTypeInfo(input.type, input.apis)).code
    : (await chooseCollectionLeafType(input.apis)).code;
  return { title, name, typeCode };
}

async function assertNameAvailable(input: {
  loginName: string;
  userId: number;
  name: string;
  info: (params: Record<string, unknown>) => Promise<unknown>;
}): Promise<void> {
  let existing: Record<string, unknown>;
  try {
    existing = unwrapData(await input.info({
      resourceIdOrName: `${input.loginName}/${input.name}`,
      isLoadLatestVersionInfo: 1,
    }));
  } catch (error) {
    if (isNotFound(error)) return;
    throw new CliError('查询现有合集失败，请检查登录和网络后重试', 'COLLECTION_LOOKUP_FAILED');
  }
  if (!existing.resourceId) return;
  const owner = Number(existing.userId ?? existing.ownerId ?? existing.creatorId);
  const values = Array.isArray(existing.subjectType) ? existing.subjectType : [existing.subjectType];
  if (owner === input.userId && values.some((value) => Number(value) === 4)) {
    throw new CliError('这个合集授权标识已经存在，请使用 collection bind 接入', 'COLLECTION_OWN_SHELL');
  }
  throw new CliError(`合集授权标识 ${input.name} 已被使用，请重新输入`, 'COLLECTION_NAME_TAKEN');
}

/** 创建合集线上壳，平台成功后才原子写入本地合集身份。 */
export async function createCollection(input: {
  cwd: string;
  title?: string;
  name?: string;
  type?: string;
  yes?: boolean;
  homeDir?: string;
  apis?: CollectionCreateApis;
}): Promise<CollectionIdentityRecord> {
  assertPlatformAllowed();
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const apis = input.apis ?? {};
  const selected = await chooseInputs({ ...input, apis });
  const info = apis.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  await assertNameAvailable({ loginName: auth.loginName, userId: auth.userId, name: selected.name, info });
  await confirmWrite(
    `创建合集\n类型：${selected.typeCode}\n标题：${selected.title}\n授权标识：${auth.loginName}/${selected.name}`,
    input.yes,
  );
  const create = apis.create ?? ((params) => FServiceAPI.Resource.create(params as never));
  const created = unwrapData(await create({
    name: selected.name,
    resourceTitle: selected.title,
    resourceTypeCode: selected.typeCode,
    subjectType: 4,
  }));
  const resourceId = typeof created.resourceId === 'string' ? created.resourceId : '';
  if (!resourceId) throw new CliError('创建失败：平台未返回 resourceId', 'COLLECTION_CREATE_FAILED');
  const resourceName = typeof created.resourceName === 'string' && created.resourceName
    ? created.resourceName
    : `${auth.loginName}/${selected.name}`;
  return createCollectionIdentity(input.cwd, {
    subject: 'collection',
    resourceId,
    resourceName,
    name: selected.name,
    title: selected.title,
    typeCode: selected.typeCode,
    env: getEnv() as FreelogEnv,
  });
}
