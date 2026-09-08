/**
 * create 建壳：查重（别人的名 → CREATE_NAME_TAKEN；自己的壳 → 指路 bind/update-version）
 * → 平台建资源 → 写 N.json。只建壳，不上传文件；--file 只记路径。
 */

import path from 'node:path';
import { CliError } from '../../core/errors';
import { createIdentity, listIdentities, updateIdentity } from '../../local/identity';
import { repairIndex } from '../../local/indexFile';
import type { IdentityRecord } from '../../local/types';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed, getEnv, type FreelogEnv } from '../env';
import { FServiceAPI } from '../../platform/api';
import { getTypeInfo, type TypeApis } from './typePick';
import { withProjectLock } from '../../local/lock';

function isFixedTemplateType(typeCode: string | undefined): boolean {
  return typeCode === 'RT001' || typeCode === 'RT002';
}

export type ResourceApis = {
  create?: (params: Record<string, unknown>) => Promise<unknown>;
  info?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  const envelope = result as { data?: Record<string, unknown>; msg?: string };
  return envelope.data ?? (result as Record<string, unknown>);
}

/** 对照 Step1 §3.2 resourceNameOptimized：非法字符换 `_`，规范化后 1–60。 */
export function normalizeResourceName(raw: string): string {
  return raw
    .replace(/[\s\\/:*?"<>|@$#]/gu, '_')
    .replace(/\p{Extended_Pictographic}/gu, '_')
    .slice(0, 60);
}

function isInsideProject(cwd: string, filePath: string): boolean {
  const resolved = path.resolve(cwd, filePath);
  const rel = path.relative(path.resolve(cwd), resolved);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function storePath(cwd: string, filePath: string): string {
  return path.relative(path.resolve(cwd), path.resolve(cwd, filePath)).replaceAll('\\', '/');
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

async function resolveTargetByFile(
  input: {
    cwd: string;
    file: string;
    identities: readonly IdentityRecord[];
    infoApi?: (params: Record<string, unknown>) => Promise<unknown>;
  },
): Promise<IdentityRecord | undefined> {
  const resolvedFile = path.resolve(input.cwd, input.file);
  const occupant = input.identities.find(
    (item) =>
      item.filePath !== undefined &&
      path.resolve(input.cwd, item.filePath) === resolvedFile,
  );
  if (!occupant || !occupant.resourceId) {
    return occupant;
  }
  // Step1 §0.3：文件被另一份占用，且那份已建壳
  const infoApi = input.infoApi ?? ((params) => FServiceAPI.Resource.info(params as never));
  const existing = unwrapData(
    await infoApi({
      resourceIdOrName: occupant.resourceId,
      isLoadLatestVersionInfo: 1,
    }).catch(() => ({ data: undefined })),
  );
  if (existing.latestVersion) {
    // i18n: cli.create.file_occupied_versioned
    throw new CliError(
      `文件 ${input.file} 已对应 ${occupant.name}。不要再 create。`,
      'CREATE_FILE_OCCUPIED',
    );
  }
  // i18n: cli.create.file_occupied
  throw new CliError(
    `文件 ${input.file} 已对应 ${occupant.name}，且还没有发行版本。请对该资源 create-version。`,
    'CREATE_FILE_OCCUPIED',
  );
}

async function resolveTargetIdentity(input: {
  cwd: string;
  file?: string;
  identities: readonly IdentityRecord[];
  infoApi?: (params: Record<string, unknown>) => Promise<unknown>;
}): Promise<IdentityRecord | undefined> {
  if (input.file) {
    const byFile = await resolveTargetByFile({
      cwd: input.cwd,
      file: input.file,
      identities: input.identities,
      infoApi: input.infoApi,
    });
    if (byFile) {
      return byFile;
    }
    if (input.identities.length > 1) {
      // i18n: cli.create.file_required
      throw new CliError('一夹多条必须指定已登记的 --file', 'IDENTITY_FILE_REQUIRED');
    }
  }
  if (input.identities.length === 1) {
    return input.identities[0];
  }
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
  const existing = unwrapData(
    await infoApi({
      resourceIdOrName: `${input.authLoginName}/${input.name}`,
      isLoadLatestVersionInfo: 1,
    }).catch(() => ({ data: undefined })),
  );

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
  file?: string;
  target?: IdentityRecord;
}): IdentityRecord {
  const filePath = input.file ? storePath(input.cwd, input.file) : undefined;
  const patch = {
    resourceId: input.resourceId,
    name: input.name,
    typeCode: input.typeCode,
    ...(filePath ? { filePath } : {}),
    env: input.env,
  };
  return input.target
    ? updateIdentity(input.cwd, input.target.n, patch)
    : createIdentity(input.cwd, {
        subject: 'resource',
        resourceId: input.resourceId,
        name: input.name,
        typeCode: input.typeCode,
        ...(filePath ? { filePath } : {}),
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
  yes?: boolean;
  homeDir?: string;
  apis?: ResourceApis & TypeApis;
}): Promise<IdentityRecord> {
  assertPlatformAllowed();
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const { title, name } = validateCreateFlags(input);

  if (input.file && !isInsideProject(input.cwd, input.file)) {
    // i18n: cli.create.file_outside
    throw new CliError('--file 必须落在当前工程里', 'CREATE_FILE_OUTSIDE');
  }

  return withProjectLock(input.cwd, async () => {
    const identities = listIdentities(input.cwd);
    const target = await resolveTargetIdentity({
      cwd: input.cwd,
      file: input.file,
      identities,
      infoApi: input.apis?.info,
    });

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
    if (isFixedTemplateType(target?.typeCode) && input.type && input.type !== target.typeCode) {
      throw new CliError('主题/插件工程的资源类型固定，不能用 --type 改写', 'CREATE_FIXED_TYPE');
    }
    const typeCode = resolveTypeCode(input.type, target);
    await getTypeInfo(typeCode, input.apis);
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
      file: input.file,
      target,
    });
    repairIndex(input.cwd);
    return record;
  });
}
