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

export type ResourceApis = {
  create?: (params: Record<string, unknown>) => Promise<unknown>;
  info?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  const envelope = result as { data?: Record<string, unknown>; msg?: string };
  return envelope.data ?? (result as Record<string, unknown>);
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
  const name = input.name?.trim();
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
  const typeCode = input.type;
  if (!typeCode) {
    // i18n: cli.create.type_required
    throw new CliError('请选择资源类型', 'CREATE_TYPE_REQUIRED');
  }

  return withProjectLock(input.cwd, async () => {
    const identities = listIdentities(input.cwd);
    let target: IdentityRecord | undefined;
    if (input.file) {
      const occupied = identities.find((item) => item.filePath === input.file);
      if (occupied?.resourceId) {
        // i18n: cli.create.file_occupied
        throw new CliError(
          `文件 ${input.file} 已对应 ${occupied.name}。不要再 create。`,
          'CREATE_FILE_OCCUPIED',
        );
      }
      target = occupied;
    } else if (identities.length === 1) {
      target = identities[0];
    } else if (identities.length > 1) {
      resolveIdentity(input.cwd, input.file);
    }

    if (target?.resourceId) {
      // i18n: cli.create.already_shell
      throw new CliError(
        '这个资源已经创建过授权条目，还没有发行版本。',
        'CREATE_ALREADY_SHELL',
      );
    }

    await getTypeInfo(typeCode, input.apis);

    const infoApi = input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
    const existing = unwrapData(
      await infoApi({
        resourceIdOrName: `${auth.loginName}/${name}`,
        isLoadLatestVersionInfo: 1,
      }).catch(() => ({ data: undefined })),
    );
    if (existing.resourceId && existing.userId === auth.userId) {
      // i18n: cli.create.own_shell
      throw new CliError(
        existing.latestVersion
          ? '这个标识已经有发行版本。'
          : '这个标识已经创建过授权条目，还没有发行版本。',
        'CREATE_OWN_SHELL',
      );
    }
    if (existing.resourceId && existing.userId !== auth.userId) {
      // i18n: naming_convention_resource_name
      throw new CliError(
        `资源授权标识 ${name} 已被使用，请重新输入。`,
        'CREATE_NAME_TAKEN',
      );
    }

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
          filePath: input.file ?? target.filePath,
          env,
        })
      : createIdentity(input.cwd, {
          subject: 'resource',
          resourceId,
          name,
          typeCode,
          filePath: input.file,
          env,
        });
    repairIndex(input.cwd);
    return record;
  });
}
