/** version set 领域层：只改唯一身份的 filePath；不打 zip、不上传、不发版。 */

import { CliError } from '../../core/errors';
import path from 'node:path';
import { identityFilePath, prepareIdentityUpdate, serializeIdentity } from '../../local/identity';
import { resolveIdentity } from '../../local/resolve';
import { withProjectLock } from '../../local/lock';
import { commitLocalTransaction } from '../../local/transaction';
import type { IdentityRecord } from '../../local/types';
import { normalizeProjectPath } from '../../local/projectPath';
import { assertArtifactAnchor } from './zip';

/** 改 filePath 记录：锁内只接受现存、与资源类型匹配的产物锚点。 */
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
    const identity = resolveIdentity(cwd, input.file);
    assertArtifactAnchor(identity.typeCode, path.resolve(cwd, artifact));
    const updated = prepareIdentityUpdate(cwd, identity.n, { filePath: artifact });
    commitLocalTransaction(cwd, [
      { path: identityFilePath(cwd, updated.n), content: serializeIdentity(updated) },
    ]);
    return updated;
  });
}
