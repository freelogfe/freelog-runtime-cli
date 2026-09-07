import { CliError } from '../../core/errors';
import { createIdentity, listIdentities, updateIdentity } from '../../local/identity';
import { repairIndex } from '../../local/indexFile';
import { resolveIdentity } from '../../local/resolve';
import { withProjectLock } from '../../local/lock';
import { FServiceAPI } from '../../platform/api';
import type { IdentityRecord } from '../../local/types';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed, getEnv } from '../env';
import { getTypeInfo, type TypeApis } from './typePick';
import path from 'node:path';

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

function toStorePath(cwd: string, filePath: string): string {
  const resolved = path.resolve(cwd, filePath);
  if (!isInsideProject(cwd, filePath)) {
    return resolved;
  }
  return path.relative(path.resolve(cwd), resolved).replaceAll('\\', '/');
}

async function ownShellGuard(input: {
  authLoginName: string;
  authUserId: number;
  name: string;
  target: IdentityRecord | undefined;
  infoApi?: (params: Record<string, unknown>) => Promise<unknown>;
}): Promise<void> {
  const infoApi =
    input.infoApi ?? ((params) => FServiceAPI.Resource.info(params as never));
  const existing = unwrapData(
    await infoApi({
      resourceIdOrName: `${input.authLoginName}/${input.name}`,
      isLoadLatestVersionInfo: 1,
    }).catch(() => ({ data: undefined })),
  );

  if (existing.resourceId && existing.userId !== input.authUserId) {
    // i18n: naming_convention_resource_name
    throw new CliError(
      `资源授权标识 ${input.name} 已被使用，请重新输入。`,
      'CREATE_NAME_TAKEN',
    );
  }
  if (existing.resourceId && existing.userId === input.authUserId) {
    // i18n: cli.create.own_shell
    throw new CliError(
      existing.latestVersion
        ? '这个标识已经有发行版本。'
        : '这个标识已经创建过授权条目，还没有发行版本。',
      'CREATE_OWN_SHELL',
    );
  }
  if (input.target?.resourceId) {
    // i18n: cli.create.already_shell
    throw new CliError(
      '这个资源已经创建过授权条目，还没有发行版本。',
      'CREATE_ALREADY_SHELL',
    );
  }
}

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
  if (input.yes && (!input.type || !input.title || !input.name)) {
    // i18n: cli.create.yes_requires_flags
    throw new CliError('--yes 必须同时提供 --type / --title / --name', 'CREATE_YES_FLAGS');
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
  if (input.file && !isInsideProject(input.cwd, input.file)) {
    // i18n: cli.create.file_outside
    throw new CliError('--file 必须落在当前工程里', 'CREATE_FILE_OUTSIDE');
  }

  return withProjectLock(input.cwd, async () => {
    const identities = listIdentities(input.cwd);
    let target: IdentityRecord | undefined;

    if (input.file) {
      const resolvedFile = path.resolve(input.cwd, input.file);
      const occupant = identities.find(
        (item) =>
          item.filePath !== undefined &&
          path.resolve(input.cwd, item.filePath) === resolvedFile,
      );
      if (occupant) {
        if (occupant.resourceId) {
          const infoApi =
            input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
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
        // Step1 §0.3：只 init 过的那份，改对那份继续 create
        target = occupant;
      }
    }

    if (!target) {
      // Step1 §0.1：--file 在 index 里用那份；只有一份用那一份；多份失败；空目录新建
      if (identities.length === 1) {
        target = identities[0];
      } else if (identities.length > 1) {
        if (!input.file) {
          resolveIdentity(input.cwd, input.file);
        }
        throw new CliError('一夹多条必须指定已登记的 --file', 'IDENTITY_FILE_REQUIRED');
      }
    }

    if (target?.resourceId) {
      // i18n: cli.create.already_shell
      throw new CliError(
        '这个资源已经创建过授权条目，还没有发行版本。',
        'CREATE_ALREADY_SHELL',
      );
    }

    // Step1 §1.1：N.json 已有 typeCode 且未传 --type → 用工程类型
    const typeCode = input.type ?? target?.typeCode;
    if (!typeCode) {
      // i18n: cli.create.type_required
      throw new CliError('请选择资源类型', 'CREATE_TYPE_REQUIRED');
    }

    await getTypeInfo(typeCode, input.apis);
    await ownShellGuard({
      authLoginName: auth.loginName,
      authUserId: auth.userId,
      name,
      target,
      infoApi: input.apis?.info,
    });

    const createApi =
      input.apis?.create ?? ((params) => FServiceAPI.Resource.create(params as never));
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

    const env = getEnv();
    const record = target
      ? updateIdentity(input.cwd, target.n, {
          resourceId,
          name,
          typeCode,
          filePath: input.file ? toStorePath(input.cwd, input.file) : undefined,
          env,
        })
      : createIdentity(input.cwd, {
          subject: 'resource',
          resourceId,
          name,
          typeCode,
          filePath: input.file ? toStorePath(input.cwd, input.file) : undefined,
          env,
        });
    repairIndex(input.cwd);
    return record;
  });
}
