/**
 * bind：把已有线上资源（自己的）接入为本地身份。只写 N.json + filePath + index，
 * 不拉版本表单、不上传。只接入单资源（subjectType 包含 1）；合集与别人的资源直接失败。
 */

import { CliError } from '../../core/errors';
import { listIdentities, prepareIdentityCreate, prepareIdentityUpdate, serializeIdentity, identityFilePath } from '../../local/identity';
import { draftFilePath } from '../../local/draft';
import { indexFilePath, indexFromIdentities, normalizeFileKey, serializeIndex } from '../../local/indexFile';
import { withProjectLock } from '../../local/lock';
import { commitLocalTransaction } from '../../local/transaction';
import { FServiceAPI } from '../../platform/api';
import type { IdentityRecord } from '../../local/types';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed, getEnv } from '../env';
import { unwrapData } from '../../platform/unwrap';
import { normalizeProjectPath } from '../../local/projectPath';

export type BindApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
};



/** bind 到本地身份：找同 resourceId / 同 filePath / 唯一空壳接管；换绑要 --force --yes 并删旧稿。 */
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
  const filePath = input.file !== undefined
    ? normalizeProjectPath(input.cwd, input.file, {
        code: 'BIND_FILE_OUTSIDE',
        message: '--file 必须落在当前工程里',
      })
    : undefined;
  const infoApi = input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const info = unwrapData(
    await infoApi({
      resourceIdOrName: input.target,
      isLoadLatestVersionInfo: 1,
    }),
  );

  if (isCollectionSubject(info.subjectType) && !isResourceSubject(info.subjectType)) {
    // i18n: cli.bind.collection
    throw new CliError('合集本期不做', 'BIND_COLLECTION');
  }
  if (!isResourceSubject(info.subjectType)) {
    throw new CliError('只能 bind 单资源', 'BIND_SUBJECT_INVALID');
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
    const byFile = filePath
      ? identities.find(
          (item) => item.filePath !== undefined && normalizeFileKey(item.filePath) === filePath,
        )
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
    if (!target && identities.length > 1 && !filePath) {
      // i18n: cli.local.identity_file_required
      throw new CliError('一夹多条必须指定 --file', 'IDENTITY_FILE_REQUIRED');
    }
    if (isThemeOrWidget(typeCode) && !filePath && !target?.filePath) {
      throw new CliError('主题/插件 bind 时请通过 --file 指定构建目录', 'BIND_FIXED_TYPE_FILE_REQUIRED');
    }

    const env = getEnv();
    if (target) {
      const resourceChanged = target.resourceId !== resourceId;
      const typeChanged = target.typeCode !== typeCode;
      if (target.resourceId && resourceChanged) {
        if (!input.force || !input.yes) {
          // i18n: cli.bind.force_required
          throw new CliError('换绑需要 --force --yes', 'BIND_FORCE_REQUIRED');
        }
      }
      const discardDraft = (target.resourceId && resourceChanged) || typeChanged;
      const updated = prepareIdentityUpdate(input.cwd, target.n, {
        resourceId,
        name,
        typeCode,
        filePath: filePath ?? target.filePath,
        env,
      });
      const nextIdentities = identities.map((item) => item.n === target.n ? updated : item);
      commitLocalTransaction(input.cwd, [
        { path: identityFilePath(input.cwd, updated.n), content: serializeIdentity(updated) },
        ...(discardDraft ? [{ path: draftFilePath(input.cwd, updated.n), content: null }] : []),
        {
          path: indexFilePath(input.cwd),
          content: serializeIndex(indexFromIdentities(nextIdentities)),
        },
      ]);
      return updated;
    }

    const created = prepareIdentityCreate(input.cwd, {
      subject: 'resource',
      resourceId,
      name,
      typeCode,
      filePath,
      env,
    });
    commitLocalTransaction(input.cwd, [
      { path: identityFilePath(input.cwd, created.n), content: serializeIdentity(created) },
      {
        path: indexFilePath(input.cwd),
        content: serializeIndex(indexFromIdentities([...identities, created])),
      },
    ]);
    return created;
  });
}

/** 平台 DTO 可把 subjectType 返回为数值、字符串或数组；单资源语义统一为“包含 1”。 */
function isResourceSubject(subjectType: unknown): boolean {
  const values = Array.isArray(subjectType) ? subjectType : [subjectType];
  return values.some((value) => Number(value) === 1);
}

function isCollectionSubject(subjectType: unknown): boolean {
  const values = Array.isArray(subjectType) ? subjectType : [subjectType];
  return values.some((value) => Number(value) === 4);
}

function isThemeOrWidget(typeCode: string): boolean {
  return typeCode === 'RT001' || typeCode === 'RT002';
}
