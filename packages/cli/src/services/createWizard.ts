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

export interface CreateCommandInput {
  title?: string;
  typeCode?: string;
  name?: string;
  resourceTypeName?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

/** 工程 create：命令行只覆盖 manifest，不能把 manifest 中已有字段当作缺失。 */
export function resolveCreateCommandInput(
  explicit: CreateCommandInput,
  local: {
    resourceTitle?: string;
    resourceTypeCode?: string;
    resourceName?: string;
    resourceTypeName?: string;
  },
): CreateCommandInput {
  return {
    title:
      nonEmpty(explicit.title) || nonEmpty(local.resourceTitle) || nonEmpty(local.resourceName),
    typeCode: nonEmpty(explicit.typeCode) || nonEmpty(local.resourceTypeCode),
    name: nonEmpty(explicit.name) || nonEmpty(local.resourceName),
    // local.resourceTypeName 是平台展示事实；只有显式 --type-name 才是 customInput。
    resourceTypeName: nonEmpty(explicit.resourceTypeName),
  };
}

/** TTY：补齐 create 缺失的 type / title / name（fieldConstraints 同源校验） */
export async function runCreateWizard(partial: {
  title?: string;
  typeCode?: string;
  name?: string;
}): Promise<CreateWizardResult> {
  let typeCode = partial.typeCode?.trim();
  if (!typeCode) {
    const picked = await pickResourceTypeInteractive();
    typeCode = picked.code;
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

  return { title, typeCode, name };
}
