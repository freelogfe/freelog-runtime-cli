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

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** ID必须可直接用于后续显式bind，不能从坏响应生成另一个身份。 */
function validResourceId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value
    && /^[a-zA-Z0-9_.-]+$/u.test(value) && value !== '.' && value !== '..';
}

function isNotFound(error: unknown): boolean {
  return (record(error) && record(error.response) && error.response.status === 404)
    || (error instanceof Error && error.message === '{"status":404}');
}

/** 与单资源相同的短标识规范化，但在合集领域独立保留，避免反向耦合。 */
export function normalizeCollectionName(raw: string): string {
  return raw.replace(/[\s\\/:*?"<>|@$#]/gu, '_').replace(/\p{Extended_Pictographic}/gu, '_');
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
  if (name.length > 60) throw new CliError('合集授权标识不超过60个字符', 'COLLECTION_NAME_TOO_LONG');
  return name;
}

async function chooseInputs(input: {
  title?: string;
  name?: string;
  type?: string;
  yes?: boolean;
  apis: CollectionTypeApis;
}): Promise<{ title: string; name: string; typeCode: string; typeLabel: string }> {
  if (input.yes && (!input.title || !input.name || !input.type)) {
    throw new CliError('--yes 必须同时提供 --type / --title / --name', 'COLLECTION_CREATE_YES_FLAGS');
  }
  const title = validateTitle(input.title ?? (isInteractive() ? await askInput('合集标题') : undefined));
  // 只有默认建议可以截短；显式输入是不可变身份，超长必须拒绝。
  const suggestedName = normalizeCollectionName(title).slice(0, 60);
  const name = validateName(input.name ?? (isInteractive()
    ? (await askInput(`合集授权标识（默认：${suggestedName}）`)).trim() || suggestedName
    : undefined));
  const type = input.type
    ? await getCollectionTypeInfo(input.type, input.apis)
    : await chooseCollectionLeafType(input.apis);
  return { title, name, typeCode: type.code, typeLabel: type.pathLabel };
}

async function assertNameAvailable(input: {
  loginName: string;
  userId: number;
  name: string;
  info: (params: Record<string, unknown>) => Promise<unknown>;
}): Promise<void> {
  const resourceName = `${input.loginName}/${input.name}`;
  let response: unknown;
  try {
    response = await input.info({
      resourceIdOrName: resourceName,
      isLoadLatestVersionInfo: 1,
    });
  } catch (error) {
    if (isNotFound(error)) return;
    throw new CliError('查询现有合集失败，请检查登录和网络后重试', 'COLLECTION_LOOKUP_FAILED');
  }
  if (!record(response) || response.ret !== 0 || response.errCode !== 0) {
    throw new CliError('查询现有合集失败，请检查登录和网络后重试', 'COLLECTION_LOOKUP_FAILED');
  }
  if (response.data === null) return;
  const existing = response.data;
  if (!record(existing) || !validResourceId(existing.resourceId) || existing.resourceName !== resourceName
    || !Number.isSafeInteger(existing.userId) || Number(existing.userId) <= 0) {
    throw new CliError('平台查重未返回可信的资源身份，请只读核对后重试', 'COLLECTION_LOOKUP_FAILED');
  }
  const values = Array.isArray(existing.subjectType) ? existing.subjectType : [existing.subjectType];
  if (values.length === 0 || values.some((value) => !Number.isSafeInteger(value) || Number(value) <= 0)) {
    throw new CliError('平台查重未返回可信的资源主体，请只读核对后重试', 'COLLECTION_LOOKUP_FAILED');
  }
  if (existing.userId === input.userId && values.includes(4)) {
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
    `创建合集\n类型：${selected.typeLabel}（${selected.typeCode}）\n标题：${selected.title}\n授权标识：${auth.loginName}/${selected.name}`,
    input.yes,
  );
  const create = apis.create ?? ((params) => FServiceAPI.Resource.create(params as never));
  const resourceName = `${auth.loginName}/${selected.name}`;
  const unknownResult = () => new CliError(
    `无法确认合集 ${resourceName} 是否已创建；请勿重复创建，请按完整授权标识只读核对后使用 collection bind 接入。`,
    'COLLECTION_CREATE_RESULT_UNKNOWN',
  );
  let response: unknown;
  try {
    response = await create({
      name: selected.name,
      resourceTitle: selected.title,
      resourceTypeCode: selected.typeCode,
      subjectType: 4,
    });
  } catch {
    // 请求可能已生效。保留本地现场，不读取异常message或自动重发。
    throw unknownResult();
  }
  if (!record(response) || response.ret !== 0 || response.errCode !== 0 || !record(response.data)) {
    throw unknownResult();
  }
  const created = response.data;
  if (!validResourceId(created.resourceId) || created.resourceName !== resourceName || created.resourceTypeCode !== selected.typeCode) {
    throw unknownResult();
  }
  try {
    return createCollectionIdentity(input.cwd, {
      subject: 'collection',
      resourceId: created.resourceId,
      resourceName,
      name: selected.name,
      title: selected.title,
      typeCode: selected.typeCode,
      env: getEnv() as FreelogEnv,
    });
  } catch {
    throw new CliError(
      `合集 ${resourceName}（ID：${created.resourceId}）已创建，但本地身份保存失败；请保留现场，勿重复创建，处理本地故障后使用 collection bind id:${created.resourceId} 接入。`,
      'COLLECTION_CREATE_LOCAL_STATE_FAILED',
    );
  }
}
