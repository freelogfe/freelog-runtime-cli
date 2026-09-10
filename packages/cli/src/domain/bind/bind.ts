/**
 * bind：把已有线上资源（自己的）接入为本地身份。只写 N.json + filePath，
 * 不拉版本表单、不上传。只接入单资源（subjectType 包含 1）；合集与别人的资源直接失败。
 */

import { CliError } from '../../core/errors';
import { existsSync } from 'node:fs';
import { prepareIdentityCreate, prepareIdentityUpdate, serializeIdentity, serializeIdentitySequence, identityFilePath, identitySequenceFilePath } from '../../local/identity';
import { draftFilePath } from '../../local/draft';
import { withProjectLock } from '../../local/lock';
import { commitLocalTransaction } from '../../local/transaction';
import { FServiceAPI } from '../../platform/api';
import type { IdentityRecord } from '../../local/types';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed, getEnv } from '../env';
import { unwrapData } from '../../platform/unwrap';
import { normalizeProjectPath } from '../../local/projectPath';
import { resolveIdentity, validateLocalState } from '../../local/resolve';
import { assertArtifactAnchor } from '../version/zip';
import { assertRemoteResourceOwned } from '../version/gates';
import path from 'node:path';

export type BindApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
};



/** bind 到本地身份：找同 resourceId / 同 filePath / 唯一空壳接管；换绑要 --force --yes 并删旧稿。 */
export async function bindResource(input: {
  cwd: string;
  target: string;
  file?: string;
  selector?: string;
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
        message: '--artifact 必须落在当前工程里',
      })
    : undefined;
  if (filePath) {
    const absolute = path.resolve(input.cwd, filePath);
    if (!existsSync(absolute)) {
      throw new CliError(`本地产物不存在：${absolute}`, 'ARTIFACT_ANCHOR_MISSING');
    }
  }
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
  const resourceId = String(info.resourceId ?? '');
  if (!resourceId) {
    throw new CliError('平台详情缺少身份字段', 'BIND_INFO_INVALID');
  }
  assertRemoteResourceOwned({
    info,
    resourceId,
    authUserId: auth.userId,
    codes: {
      invalid: 'BIND_INFO_INVALID',
      notOwner: 'BIND_NOT_OWNER',
    },
  });
  const resourceName = String(info.resourceName ?? '');
  const name = (resourceName || String(info.name ?? '')).split('/').pop() ?? '';
  const title = String(info.resourceTitle ?? info.title ?? name);
  const resourceType = info.resourceType;
  const typeFromArray = Array.isArray(resourceType) ? String(resourceType[0] ?? '') : '';
  const typeCode = String(info.resourceTypeCode ?? typeFromArray);
  if (!name || !typeCode || !title) {
    // i18n: cli.bind.info_invalid
    throw new CliError('平台详情缺少身份字段', 'BIND_INFO_INVALID');
  }
  // 老接口偶尔只给短 name；已核对 owner 后用当前登录名补成完整缓存，
  // 新状态后续只以完整 resourceName 参与 `name:` 身份选择。
  const stableResourceName = resourceName || `${auth.loginName}/${name}`;

  return withProjectLock(input.cwd, () => {
    const identities = validateLocalState(input.cwd);
    const byId = identities.find((item) => item.resourceId === resourceId);
    const byFile = filePath
      ? identities.find(
          (item) => normalizeProjectPath(input.cwd, item.filePath) === filePath,
        )
      : undefined;
    const unbound = identities.filter((item) => !item.resourceId);

    if (byFile && byId && byFile.n !== byId.n) {
      // i18n: cli.bind.path_taken
      throw new CliError('路径已被占用', 'BIND_PATH_TAKEN');
    }

    let target = input.selector ? resolveIdentity(input.cwd, input.selector) : byId;
    if (input.selector && byId && target && target.n !== byId.n) {
      throw new CliError(`资源已绑定到 ${byId.n}.json`, 'BIND_ID_TAKEN');
    }
    if (!target && filePath) {
      target = unbound.find((item) => item.filePath === filePath);
    }
    if (!target && filePath === undefined && unbound.length === 1) {
      target = unbound[0];
    }
    if (!target && unbound.length > 1) throw new CliError('当前工程有多份未绑定资源状态；请使用 --resource 指定资源', 'IDENTITY_RESOURCE_REQUIRED');
    if (byFile && target?.n !== byFile.n) {
      throw new CliError('路径已被占用', 'BIND_PATH_TAKEN');
    }
    const resolvedFilePath = filePath ?? target?.filePath;
    if (!resolvedFilePath) {
      throw new CliError('新增本地状态时必须通过 --artifact 关联本地产物', 'BIND_ARTIFACT_REQUIRED');
    }
    // 接续未绑定身份时也要复验原锚点；用户可能已在 init 后删除文件或构建目录。
    assertArtifactAnchor(typeCode, path.resolve(input.cwd, resolvedFilePath), input.cwd);

    const env = getEnv();
    if (target) {
      if (target.resourceId && (target.env ?? 'prod') !== env) {
        throw new CliError(
          `不能把 ${target.n}.json（${target.env ?? 'prod'}）改绑到 ${env} 环境；请新建或选择该环境的本地资源状态`,
          'BIND_ENV_MISMATCH',
        );
      }
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
        resourceName: stableResourceName,
        name,
        title,
        typeCode,
        filePath: resolvedFilePath,
        env,
      });
      commitLocalTransaction(input.cwd, [
        { path: identityFilePath(input.cwd, updated.n), content: serializeIdentity(updated) },
        ...(discardDraft ? [{ path: draftFilePath(input.cwd, updated.n), content: null }] : []),
      ]);
      return updated;
    }

    const created = prepareIdentityCreate(input.cwd, {
      subject: 'resource',
      resourceId,
      resourceName: stableResourceName,
      name,
      title,
      typeCode,
      filePath: resolvedFilePath,
      env,
    });
    commitLocalTransaction(input.cwd, [
      { path: identityFilePath(input.cwd, created.n), content: serializeIdentity(created) },
      { path: identitySequenceFilePath(input.cwd), content: serializeIdentitySequence(created.n) },
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
