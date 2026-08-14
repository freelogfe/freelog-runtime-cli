import * as p from '@clack/prompts';
import { consola } from 'consola';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { t } from '../i18n/index.js';
import { pickResourceTypeInteractive } from './init/picker.js';
import {
  clackTextField,
  normalizePromptCreateName,
} from './shared/fieldConstraints.js';
import { validateCreateNameInput } from './resourceName.js';

export interface CreateWizardResult {
  title: string;
  typeCode: string;
  name: string;
  resourceTypeName?: string;
}

/** TTY：补齐 create 缺失的 type / title / name（fieldConstraints 同源校验） */
export async function runCreateWizard(partial: {
  title?: string;
  typeCode?: string;
  name?: string;
}): Promise<CreateWizardResult> {
  let typeCode = partial.typeCode?.trim();
  let resourceTypeName: string | undefined;
  if (!typeCode) {
    const picked = await pickResourceTypeInteractive();
    typeCode = picked.code;
    resourceTypeName = picked.name;
  }

  let title = partial.title?.trim();
  if (!title) {
    const answer = await p.text(clackTextField('FORM-RES-TITLE'));
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    title = String(answer).trim();
  }

  let name = partial.name?.trim();
  if (!name) {
    const answer = await p.text(clackTextField('FORM-RES-NAME', { defaultValue: title }));
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    const nameResult = normalizePromptCreateName(String(answer));
    if (nameResult.wasModified) {
      consola.info(
        t(I18N_KEYS.input_resourceauthid_automodified_msg, { authid: nameResult.normalized }),
      );
    }
    name = nameResult.normalized;
  } else {
    const validated = validateCreateNameInput(name);
    if (validated.error) throw cliError(validated.error, { code: 4 });
    name = validated.normalized;
  }

  return { title, typeCode, name, resourceTypeName };
}
