import { CliError } from '../core/errors';
import { repairIndex, normalizeFileKey } from './indexFile';
import { listIdentities } from './identity';
import type { IdentityRecord } from './types';

function matchFile(identity: IdentityRecord, file: string): boolean {
  if (!identity.filePath) {
    return false;
  }
  return normalizeFileKey(identity.filePath) === normalizeFileKey(file);
}

export function resolveIdentity(cwd: string, file?: string): IdentityRecord {
  const identities = listIdentities(cwd);
  if (identities.length === 0) {
    // i18n: cli.local.identity_none
    throw new CliError('当前目录没有身份文件', 'IDENTITY_NOT_FOUND');
  }

  let selected: IdentityRecord;
  if (file !== undefined && file !== '') {
    const matched = identities.filter((identity) => matchFile(identity, file));
    if (matched.length > 0) {
      selected = matched[0]!;
    } else if (identities.length === 1) {
      selected = identities[0]!;
    } else {
      // i18n: cli.local.identity_file_unmatched
      throw new CliError(`没有与 --file ${file} 对应的身份`, 'IDENTITY_FILE_UNMATCHED');
    }
  } else if (identities.length === 1) {
    selected = identities[0]!;
  } else {
    // i18n: cli.local.identity_file_required
    throw new CliError('一夹多条必须指定 --file', 'IDENTITY_FILE_REQUIRED');
  }

  repairIndex(cwd);
  return selected;
}
