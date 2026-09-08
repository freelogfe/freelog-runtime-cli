/** version set 领域层：只改 N.json.filePath + 修 index；不打 zip、不上传、不发版。 */

import { CliError } from '../../core/errors';
import { listIdentities, updateIdentity } from '../../local/identity';
import { repairIndex } from '../../local/indexFile';
import { resolveIdentity } from '../../local/resolve';
import { withProjectLock } from '../../local/lock';
import type { IdentityRecord } from '../../local/types';
import { normalizeProjectPath } from '../../local/projectPath';

/** 改 filePath 记录：锁内改身份并修 index；本地文件在不在不校验（记录与磁盘解耦）。 */
export function setIdentityFilePath(
  cwd: string,
  input: { file?: string; artifact?: string },
): IdentityRecord {
  return withProjectLock(cwd, () => {
    const identities = listIdentities(cwd);
    const selector = input.file !== undefined
      ? normalizeProjectPath(cwd, input.file)
      : undefined;
    let artifact = input.artifact !== undefined
      ? normalizeProjectPath(cwd, input.artifact)
      : undefined;
    if (!artifact && identities.length === 1 && selector) {
      // 单身份兼容旧 `version set --file <新路径>`。
      artifact = selector;
    }
    if (!artifact) {
      // i18n: cli.set.artifact_required
      throw new CliError(
        identities.length > 1
          ? '多份资源请用 --file 选择身份，并用 --artifact 指定新路径'
          : '请提供 --artifact',
        'SET_ARTIFACT_REQUIRED',
      );
    }
    const identity = resolveIdentity(cwd, selector);
    const updated = updateIdentity(cwd, identity.n, { filePath: artifact });
    repairIndex(cwd);
    return updated;
  });
}
