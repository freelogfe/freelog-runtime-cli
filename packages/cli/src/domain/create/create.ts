/**
 * create 建壳：查重（别人的名 → CREATE_NAME_TAKEN；自己的壳 → 指路 bind/update-version）
 * → 平台建资源 → 写 N.json。只建壳，不上传文件；产物路径只作默认记录。
 */

import { CliError } from '../../core/errors';
import path from 'node:path';
import { createIdentity, updateIdentity } from '../../local/identity';
import { resolveIdentity, validateLocalState } from '../../local/resolve';
import type { IdentityRecord } from '../../local/types';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed, getEnv, type FreelogEnv } from '../env';
import { FServiceAPI } from '../../platform/api';
import { getTypeInfo, type TypeApis } from './typePick';
import { withProjectLock } from '../../local/lock';
import { normalizeProjectPath } from '../../local/projectPath';
import { assertArtifactAnchor } from '../version/zip';

export type ResourceApis = {
  create?: (params: Record<string, unknown>) => Promise<unknown>;
  info?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  const envelope = result as { data?: Record<string, unknown>; msg?: string };
  return envelope.data ?? (result as Record<string, unknown>);
}

/**
 * `Resource.info` 对不存在的授权标识会以 HTTP 404 拒绝；这是“可创建”的
 * 唯一错误分支。网络、401/403、5xx 等都不能被伪装成“名称可用”。
 */
function isNotFound(error: unknown): boolean {
  const response = (error as { response?: { status?: unknown } })?.response;
  if (Number(response?.status) === 404) return true;
  const message = (error as { message?: unknown })?.message;
  if (typeof message !== 'string') return false;
  try {
    return Number((JSON.parse(message) as { status?: unknown }).status) === 404;
  } catch {
    return false;
  }
}

async function lookupResource(
  infoApi: (params: Record<string, unknown>) => Promise<unknown>,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    return unwrapData(await infoApi(params));
  } catch (error) {
    if (isNotFound(error)) return {};
    throw new CliError('查询现有资源失败，请检查登录和网络后重试', 'CREATE_LOOKUP_FAILED');
  }
}

/** 对照 Step1 §3.2 resourceNameOptimized：非法字符换 `_`，规范化后 1–60。 */
export function normalizeResourceName(raw: string): string {
  return raw
    .replace(/[\s\\/:*?"<>|@$#]/gu, '_')
    .replace(/\p{Extended_Pictographic}/gu, '_')
    .slice(0, 60);
}

function resolveTypeCode(inputType: string | undefined, target: IdentityRecord | undefined): string {
  const typeCode = inputType ?? target?.typeCode;
  if (!typeCode) {
    // i18n: cli.create.type_required
    throw new CliError('请选择资源类型', 'CREATE_TYPE_REQUIRED');
  }
  return typeCode;
}

function validateCreateFlags(input: {
  title?: string;
  name?: string;
  yes?: boolean;
}): { title: string; name: string } {
  if (input.yes && (!input.title || !input.name)) {
    // i18n: cli.create.yes_requires_flags
    throw new CliError('--yes 必须同时提供 --title / --name', 'CREATE_YES_FLAGS');
  }

  const title = input.title?.trim();
  const name = normalizeResourceName(input.name?.trim() ?? '');

  if (!title) {
    // i18n: cli.create.title_required
    throw new CliError('请输入资源标题', 'CREATE_TITLE_REQUIRED');
  }
  if (title.length > 100) {
    // i18n: cli.create.title_too_long
    throw new CliError('不超过100个字符', 'CREATE_TITLE_TOO_LONG');
  }
  if (!name) {
    // i18n: cli.create.name_required
    throw new CliError('请提供 --name', 'CREATE_NAME_REQUIRED');
  }
  if (name.includes('/')) {
    // i18n: cli.create.name_slash
    throw new CliError('授权标识只传短段，不要带 username/', 'CREATE_NAME_SLASH');
  }
  return { title, name };
}

function resolveTargetIdentity(input: {
  cwd: string;
  selector?: string;
  identities: readonly IdentityRecord[];
}): IdentityRecord | undefined {
  if (input.selector) return resolveIdentity(input.cwd, input.selector);
  const unbound = input.identities.filter((identity) => !identity.resourceId);
  if (unbound.length === 1) return unbound[0];
  if (unbound.length > 1) throw new CliError('当前工程有多份未绑定资源状态；请使用 --resource 指定资源', 'IDENTITY_RESOURCE_REQUIRED');
  return undefined;
}

async function assertOwnShellAvailable(input: {
  authLoginName: string;
  authUserId: number;
  name: string;
  target?: IdentityRecord;
  infoApi?: (params: Record<string, unknown>) => Promise<unknown>;
}): Promise<void> {
  const infoApi = input.infoApi ?? ((params) => FServiceAPI.Resource.info(params as never));
  const existing = await lookupResource(infoApi, {
    resourceIdOrName: `${input.authLoginName}/${input.name}`,
    isLoadLatestVersionInfo: 1,
  });

  if (!existing.resourceId) {
    return;
  }
  if (existing.userId !== input.authUserId) {
    // i18n: naming_convention_resource_name
    throw new CliError(
      `资源授权标识 ${input.name} 已被使用，请重新输入。`,
      'CREATE_NAME_TAKEN',
    );
  }
  // i18n: cli.create.own_shell
  throw new CliError(
    existing.latestVersion
      ? '这个标识已经有发行版本。'
      : '这个标识已经创建过授权条目，还没有发行版本。',
    'CREATE_OWN_SHELL',
  );
}

function writeCreatedIdentity(input: {
  cwd: string;
  env: FreelogEnv;
  name: string;
  typeCode: string;
  resourceId: string;
  title: string;
  file?: string;
  target?: IdentityRecord;
}): IdentityRecord {
  const filePath = input.file ?? input.target?.filePath;
  if (!filePath) throw new CliError('新资源必须通过 --artifact 关联本地产物', 'CREATE_ARTIFACT_REQUIRED');
  const patch = {
    resourceId: input.resourceId,
    name: input.name,
    title: input.title,
    typeCode: input.typeCode,
    filePath,
    env: input.env,
  };
  return input.target
    ? updateIdentity(input.cwd, input.target.n, patch)
    : createIdentity(input.cwd, {
        subject: 'resource',
        resourceId: input.resourceId,
        name: input.name,
        title: input.title,
        typeCode: input.typeCode,
        filePath,
        env: input.env,
      });
}

/** 建资源壳：只 POST /v2/resources（title+类型+授权标识），不传文件；本地只落 N.json，不建稿。 */
export async function createResource(input: {
  cwd: string;
  title?: string;
  type?: string;
  name?: string;
  file?: string;
  selector?: string;
  yes?: boolean;
  homeDir?: string;
  apis?: ResourceApis & TypeApis;
}): Promise<IdentityRecord> {
  assertPlatformAllowed();
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  validateLocalState(input.cwd);
  const { title, name } = validateCreateFlags(input);

  const file = input.file !== undefined
    ? normalizeProjectPath(input.cwd, input.file, {
        code: 'CREATE_FILE_OUTSIDE',
        message: '--artifact 必须落在当前工程里',
      })
    : undefined;

  return withProjectLock(input.cwd, async () => {
    const identities = validateLocalState(input.cwd);
    const target = resolveTargetIdentity({
      cwd: input.cwd,
      selector: input.selector,
      identities,
    });

    const occupant = file
      ? identities.find((identity) => identity.filePath === file && identity.n !== target?.n)
      : undefined;
    if (occupant) {
      throw new CliError(`产物路径 ${file} 已被 ${occupant.n}.json 占用`, 'CREATE_FILE_OCCUPIED');
    }

    if (target?.resourceId) {
      // i18n: cli.create.already_shell
      throw new CliError(
        '这个资源已经创建过授权条目，还没有发行版本。',
        'CREATE_ALREADY_SHELL',
      );
    }

    if (input.yes && !input.type && !target?.typeCode) {
      throw new CliError('--yes 在没有工程类型时必须提供 --type', 'CREATE_YES_FLAGS');
    }
    const artifact = file ?? target?.filePath;
    if (!artifact) {
      throw new CliError('新资源必须通过 --artifact 关联本地产物', 'CREATE_ARTIFACT_REQUIRED');
    }
    const targetTypeCode = target?.typeCode;
    if ((targetTypeCode === 'RT001' || targetTypeCode === 'RT002') && input.type && input.type !== targetTypeCode) {
      throw new CliError('主题/插件工程的资源类型固定，不能用 --type 改写', 'CREATE_FIXED_TYPE');
    }
    const typeCode = resolveTypeCode(input.type, target);
    await getTypeInfo(typeCode, input.apis);
    // 即使接续 init 留下的未绑定身份、没有再次传 --artifact，也必须确认
    // 记录的锚点仍真实存在；不能把已删除的文件/构建目录带进新的线上资源壳。
    assertArtifactAnchor(typeCode, path.resolve(input.cwd, artifact));
    await assertOwnShellAvailable({
      authLoginName: auth.loginName,
      authUserId: auth.userId,
      name,
      infoApi: input.apis?.info,
    });

    const createApi = input.apis?.create ?? ((params) => FServiceAPI.Resource.create(params as never));
    const created = unwrapData(
      await createApi({
        name,
        resourceTitle: title,
        resourceTypeCode: typeCode,
      }),
    );
    const resourceId = created.resourceId;
    if (typeof resourceId !== 'string') {
      // i18n: cli.create.failed
      throw new CliError('创建失败：平台未返回 resourceId', 'CREATE_FAILED');
    }

    const record = writeCreatedIdentity({
      cwd: input.cwd,
      env: getEnv() as FreelogEnv,
      name,
      typeCode,
      resourceId,
      title,
      file,
      target,
    });
    return record;
  });
}
