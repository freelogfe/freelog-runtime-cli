import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { VersionProject } from '../../config/project/types.js';
import type { ProjectStore } from './types.js';

export function requireVersionProject(store: ProjectStore): VersionProject {
  const version = store.loadVersion();
  if (!version) {
    throw cliError(I18N_KEYS.manifest_version_missing, {
      code: 4,
      hint: 'freelog-cli version set --version <ver> --file <path>',
    });
  }
  return version;
}
