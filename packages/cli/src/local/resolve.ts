/** 单工程只允许唯一的 1.json 身份；旧多身份状态必须先迁移为独立工程。 */

import { CliError } from '../core/errors';
import { listIdentities } from './identity';
import type { IdentityRecord } from './types';

/** 定位操作目标身份：--file 匹配 filePath，单条直取，多条未指定报错；顺手把 index.json 对齐 N.json。 */
export function resolveIdentity(cwd: string, _legacyFile?: string): IdentityRecord {
  const identities = listIdentities(cwd);
  if (identities.length === 0) {
    // i18n: cli.local.identity_none
    throw new CliError('当前目录没有身份文件', 'IDENTITY_NOT_FOUND');
  }

  if (identities.length !== 1 || identities[0]!.n !== 1) {
    throw new CliError('发现旧的多资源本地状态；请将每份资源迁移到独立工程后再继续', 'IDENTITY_MIGRATION_REQUIRED');
  }
  return identities[0]!;
}
