/** version set 领域层：只改 N.json.filePath + 修 index；不打 zip、不上传、不发版。 */

import { CliError } from '../../core/errors';
import { updateIdentity } from '../../local/identity';
import { repairIndex } from '../../local/indexFile';
import { resolveIdentity } from '../../local/resolve';
import { withProjectLock } from '../../local/lock';
import type { IdentityRecord } from '../../local/types';

export function setIdentityFilePath(cwd: string, filePath: string): IdentityRecord {
  if (!filePath) {
    // i18n: cli.set.file_required
    throw new CliError('请提供 --file', 'SET_FILE_REQUIRED');
  }
  return withProjectLock(cwd, () => {
    const identity = resolveIdentity(cwd, filePath);
    const updated = updateIdentity(cwd, identity.n, { filePath });
    repairIndex(cwd);
    return updated;
  });
}
