/** version set 领域层：只改唯一身份的 filePath；不打 zip、不上传、不发版。 */

import { CliError } from '../../core/errors';
import { identityFilePath, prepareIdentityUpdate, serializeIdentity } from '../../local/identity';
import { resolveIdentity } from '../../local/resolve';
import { withProjectLock } from '../../local/lock';
import { commitLocalTransaction } from '../../local/transaction';
import type { IdentityRecord } from '../../local/types';
import { normalizeProjectPath } from '../../local/projectPath';

/** 改 filePath 记录：锁内改身份并修 index；本地文件在不在不校验（记录与磁盘解耦）。 */
export function setIdentityFilePath(
  cwd: string,
  input: { file?: string; artifact?: string },
): IdentityRecord {
  return withProjectLock(cwd, () => {
    const artifact = input.artifact !== undefined
      ? normalizeProjectPath(cwd, input.artifact)
      : undefined;
    if (!artifact) {
      throw new CliError('请提供 --artifact', 'SET_ARTIFACT_REQUIRED');
    }
    const identity = resolveIdentity(cwd);
    const updated = prepareIdentityUpdate(cwd, identity.n, { filePath: artifact });
    commitLocalTransaction(cwd, [
      { path: identityFilePath(cwd, updated.n), content: serializeIdentity(updated) },
    ]);
    return updated;
  });
}
