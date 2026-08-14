import type { TextOptions } from '@clack/prompts';
import path from 'node:path';
import { isInteractive } from '../../core/tty.js';
import { I18N_KEYS, t } from '../../i18n/index.js';
import { assertLocalCoverFile } from '../coverUpload.js';
import { validateCreateNameInput } from '../resourceName.js';
import {
  FIELD_LIMITS,
  validateCollectionItemTitleInput,
  validateIntroInput,
  validatePolicyNameInput,
  validateResourceTitleInput,
  validateTagsCsvInput,
  validateTagsInput,
} from '../validation.js';

export type FieldFormId =
  | 'FORM-RES-TITLE'
  | 'FORM-RES-NAME'
  | 'FORM-LIST-INTRO'
  | 'FORM-LIST-TAGS'
  | 'FORM-LIST-COVER'
  | 'FORM-POL-NAME'
  | 'FORM-COL-TITLE'
  | 'FORM-BATCH-TITLE';

export interface FieldSpec {
  formId: FieldFormId;
  label: string;
  hint: () => string;
  helpSnippet: string;
  validate: (value: string) => string | undefined;
}

function cliErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function shouldRunFieldWizard(args: {
  yes?: boolean;
  json?: boolean;
  hasBusinessFlags: boolean;
}): boolean {
  return isInteractive(args.yes) && !args.json && !args.hasBusinessFlags;
}

export function helpSnippet(formId: FieldFormId): string {
  return FIELD_SPECS[formId].helpSnippet;
}

export const FIELD_SPECS: Record<FieldFormId, FieldSpec> = {
  'FORM-RES-TITLE': {
    formId: 'FORM-RES-TITLE',
    label: '资源标题（展示名）',
    hint: () => `不可为空，最多 ${FIELD_LIMITS.resourceTitleMax} 字`,
    helpSnippet: `非空，最多 ${FIELD_LIMITS.resourceTitleMax} 字`,
    validate: (value) => validateResourceTitleInput(value, true),
  },
  'FORM-RES-NAME': {
    formId: 'FORM-RES-NAME',
    label: '资源短授权标识',
    hint: () => t(I18N_KEYS.rqr_input_resourceauthid_hint),
    helpSnippet: '1–60 字；非法字符将自动转为下划线',
    validate: (value) => validateCreateNameInput(value).error,
  },
  'FORM-LIST-INTRO': {
    formId: 'FORM-LIST-INTRO',
    label: '简介',
    hint: () => `最多 ${FIELD_LIMITS.introMax} 字`,
    helpSnippet: `最多 ${FIELD_LIMITS.introMax} 字`,
    validate: (value) => validateIntroInput(value),
  },
  'FORM-LIST-TAGS': {
    formId: 'FORM-LIST-TAGS',
    label: '标签',
    hint: () =>
      `逗号分隔，最多 ${FIELD_LIMITS.tagsMaxCount} 个，每个最多 ${FIELD_LIMITS.tagMaxLength} 字`,
    helpSnippet: `最多 ${FIELD_LIMITS.tagsMaxCount} 个，单项 ≤${FIELD_LIMITS.tagMaxLength} 字，逗号分隔`,
    validate: (value) => validateTagsCsvInput(value),
  },
  'FORM-LIST-COVER': {
    formId: 'FORM-LIST-COVER',
    label: '封面',
    hint: () => '本地路径：JPG/PNG/GIF，≤5MB；800px 为建议',
    helpSnippet: 'JPG/PNG/GIF，≤5MB',
    validate: (value) => {
      const trimmed = value.trim();
      if (!trimmed) return '路径不能为空';
      if (/^https?:\/\//i.test(trimmed)) return undefined;
      try {
        assertLocalCoverFile(path.resolve(trimmed));
        return undefined;
      } catch (error) {
        return cliErrorMessage(error);
      }
    },
  },
  'FORM-POL-NAME': {
    formId: 'FORM-POL-NAME',
    label: '策略名称',
    hint: () => `${FIELD_LIMITS.policyNameMin}–${FIELD_LIMITS.policyNameMax} 字`,
    helpSnippet: `${FIELD_LIMITS.policyNameMin}–${FIELD_LIMITS.policyNameMax} 字`,
    validate: (value) => validatePolicyNameInput(value),
  },
  'FORM-COL-TITLE': {
    formId: 'FORM-COL-TITLE',
    label: '条目标题',
    hint: () => `最多 ${FIELD_LIMITS.collectionItemTitleMax} 字`,
    helpSnippet: `最多 ${FIELD_LIMITS.collectionItemTitleMax} 字`,
    validate: (value) => validateCollectionItemTitleInput(value, true),
  },
  'FORM-BATCH-TITLE': {
    formId: 'FORM-BATCH-TITLE',
    label: '资源标题前缀',
    hint: () => `可选，最多 ${FIELD_LIMITS.resourceTitleMax} 字`,
    helpSnippet: `可选，最多 ${FIELD_LIMITS.resourceTitleMax} 字`,
    validate: (value) => {
      if (!value.trim()) return undefined;
      return validateResourceTitleInput(value, false);
    },
  },
};

export function fieldPromptMessage(formId: FieldFormId): string {
  const spec = FIELD_SPECS[formId];
  return `${spec.label}\n  ${spec.hint()}`;
}

export function clackTextField(
  formId: FieldFormId,
  overrides?: Partial<TextOptions>,
): TextOptions {
  const spec = FIELD_SPECS[formId];
  return {
    message: fieldPromptMessage(formId),
    validate: (value) => spec.validate(String(value ?? '')),
    ...overrides,
  };
}

export function parseTagsCsv(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function normalizePromptCreateName(raw: string): {
  normalized: string;
  wasModified: boolean;
} {
  const result = validateCreateNameInput(raw);
  if (result.error) {
    throw new Error(result.error);
  }
  const trimmed = raw.trim();
  return {
    normalized: result.normalized,
    wasModified: trimmed !== result.normalized,
  };
}

export { validateCreateNameInput, validateTagsInput };
