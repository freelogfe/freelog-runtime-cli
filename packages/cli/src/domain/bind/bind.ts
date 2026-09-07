import { CliError } from '../../core/errors';
import { createIdentity, listIdentities, updateIdentity } from '../../local/identity';
import { deleteDraft } from '../../local/draft';
import { repairIndex } from '../../local/indexFile';
import { withProjectLock } from '../../local/lock';
import { FServiceAPI } from '../../platform/api';
import type { IdentityRecord } from '../../local/types';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed, getEnv } from '../env';

export type BindApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  const envelope = result as { data?: Record<string, unknown> };
  return envelope.data ?? (result as Record<string, unknown>);
}

export async function bindResource(input: {
  cwd: string;
  target: string;
  file?: string;
  force?: boolean;
  yes?: boolean;
  homeDir?: string;
  apis?: BindApis;
}): Promise<IdentityRecord> {
  assertPlatformAllowed();
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const infoApi = input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const info = unwrapData(
    await infoApi({
      resourceIdOrName: input.target,
      isLoadLatestVersionInfo: 1,
    }),
  );

  if (info.subjectType === 4) {
    // i18n: cli.bind.collection
    throw new CliError('合集本期不做', 'BIND_COLLECTION');
  }
  if (info.userId !== auth.userId) {
    // i18n: cli.bind.not_owner
    throw new CliError('只能 bind 自己的资源', 'BIND_NOT_OWNER');
  }
  const resourceId = String(info.resourceId ?? '');
  const name = String(info.resourceName ?? info.name ?? '').split('/').pop() ?? '';
  const resourceType = info.resourceType;
  const typeFromArray = Array.isArray(resourceType) ? String(resourceType[0] ?? '') : '';
  const typeCode = String(info.resourceTypeCode ?? typeFromArray);
  if (!resourceId || !name || !typeCode) {
    // i18n: cli.bind.info_invalid
    throw new CliError('平台详情缺少身份字段', 'BIND_INFO_INVALID');
  }

  return withProjectLock(input.cwd, () => {
    const identities = listIdentities(input.cwd);
    const byId = identities.find((item) => item.resourceId === resourceId);
    const byFile = input.file
      ? identities.find((item) => item.filePath === input.file)
      : undefined;
    const unbound = identities.filter((item) => !item.resourceId);

    if (byFile && byId && byFile.n !== byId.n) {
      // i18n: cli.bind.path_taken
      throw new CliError('路径已被占用', 'BIND_PATH_TAKEN');
    }

    let target = byId ?? byFile;
    if (!target && unbound.length === 1) {
      target = unbound[0];
    }
    if (!target && identities.length > 1 && !input.file) {
      // i18n: cli.local.identity_file_required
      throw new CliError('一夹多条必须指定 --file', 'IDENTITY_FILE_REQUIRED');
    }

    const env = getEnv();
    if (target) {
      if (target.resourceId && target.resourceId !== resourceId) {
        if (!input.force || !input.yes) {
          // i18n: cli.bind.force_required
          throw new CliError('换绑需要 --force --yes', 'BIND_FORCE_REQUIRED');
        }
        deleteDraft(input.cwd, target.n);
      }
      const updated = updateIdentity(input.cwd, target.n, {
        resourceId,
        name,
        typeCode,
        filePath: input.file ?? target.filePath,
        env,
      });
      repairIndex(input.cwd);
      return updated;
    }

    const created = createIdentity(input.cwd, {
      subject: 'resource',
      resourceId,
      name,
      typeCode,
      filePath: input.file,
      env,
    });
    repairIndex(input.cwd);
    return created;
  });
}
