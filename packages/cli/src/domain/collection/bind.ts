/** 将线上本人合集接入同一 .freelog 编号空间；不需要、也不接受本地产物。 */

import { CliError } from '../../core/errors';
import { createCollectionIdentity, listCollectionIdentities } from '../../local/identity';
import type { CollectionIdentityRecord } from '../../local/types';
import { assertPlatformAllowed, getEnv, type FreelogEnv } from '../env';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';

/** 重新核验线上本人合集后接入无文件路径的本地身份。 */
export async function bindCollection(input: {
  cwd: string;
  target: string;
  homeDir?: string;
  apis?: CollectionTargetApis;
}): Promise<CollectionIdentityRecord> {
  assertPlatformAllowed();
  const target = await resolveCollectionTarget({
    cwd: input.cwd,
    selector: input.target,
    homeDir: input.homeDir,
    apis: input.apis,
  });
  const existing = listCollectionIdentities(input.cwd).find((identity) => identity.resourceId === target.resourceId);
  if (existing) {
    if ((existing.env ?? 'prod') !== getEnv()) throw new CliError('同一合集不能跨环境复用本地身份', 'COLLECTION_ENV_MISMATCH');
    return existing;
  }
  const byName = listCollectionIdentities(input.cwd).find((identity) => identity.resourceName === target.resourceName);
  if (byName) throw new CliError(`合集标识已绑定到 ${byName.n}.json`, 'COLLECTION_NAME_BOUND');
  const name = target.resourceName.split('/').pop() ?? '';
  if (!name) throw new CliError('平台合集详情缺少授权标识', 'COLLECTION_INFO_INVALID');
  return createCollectionIdentity(input.cwd, {
    subject: 'collection',
    resourceId: target.resourceId,
    resourceName: target.resourceName,
    name,
    title: target.title || name,
    typeCode: target.typeCode,
    env: getEnv() as FreelogEnv,
  });
}
