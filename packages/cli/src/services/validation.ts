import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import semver from 'semver';

/** 字段约束 → docs/新方案/开发/CLI字段账本.md；文案与 Console i18n 同源 */
export const FIELD_LIMITS = {
  resourceTitleMax: 100,
  collectionItemTitleMax: 100,
  introMax: 200,
  tagsMaxCount: 20,
  tagMaxLength: 20,
  policyNameMin: 2,
  policyNameMax: 20,
} as const;

export function assertResourceTitle(title: string | undefined, required = false): void {
  if (title === undefined || title === '') {
    if (required) {
      throw cliError(I18N_KEYS.naming_convention_resource_title_required, { code: 4 });
    }
    return;
  }
  const trimmed = title.trim();
  if (!trimmed) {
    throw cliError(I18N_KEYS.naming_convention_resource_title_required, { code: 4 });
  }
  if (trimmed.length > FIELD_LIMITS.resourceTitleMax) {
    throw cliError(I18N_KEYS.cli_title_exceeds_100_chars, {
      code: 4,
      details: { length: trimmed.length, max: FIELD_LIMITS.resourceTitleMax },
    });
  }
}

export function assertTags(tags: string[] | undefined): void {
  if (!tags) return;
  if (tags.length > FIELD_LIMITS.tagsMaxCount) {
    throw cliError(I18N_KEYS.tags_count_exceeds_max, {
      code: 4,
      details: { count: tags.length, max: FIELD_LIMITS.tagsMaxCount },
    });
  }
  for (const tag of tags) {
    if (!tag || !tag.trim()) {
      throw cliError(I18N_KEYS.tag_empty, { code: 4 });
    }
    if (tag.length > FIELD_LIMITS.tagMaxLength) {
      throw cliError(I18N_KEYS.tag_length_exceeds_max, {
        code: 4,
        details: { tag, max: FIELD_LIMITS.tagMaxLength },
      });
    }
  }
}

export function assertIntro(intro: string | undefined): void {
  if (intro !== undefined && intro.length > FIELD_LIMITS.introMax) {
    throw cliError(I18N_KEYS.intro_max_200, {
      code: 4,
      details: { length: intro.length, max: FIELD_LIMITS.introMax },
    });
  }
}

export function assertCollectionItemTitle(title: string | undefined, required = false): void {
  if (title === undefined || title.trim() === '') {
    if (required) throw cliError(I18N_KEYS.missing_title_flag, { code: 4 });
    return;
  }
  if (title.trim().length > FIELD_LIMITS.collectionItemTitleMax) {
    throw cliError(I18N_KEYS.collection_item_title_exceeds_100, {
      code: 4,
      details: { length: title.trim().length, max: FIELD_LIMITS.collectionItemTitleMax },
    });
  }
}

export function assertPolicyName(name: string | undefined): void {
  const value = name?.trim() || '';
  if (!value) throw cliError(I18N_KEYS.policy_name_required, { code: 4 });
  if (value.length < FIELD_LIMITS.policyNameMin || value.length > FIELD_LIMITS.policyNameMax) {
    throw cliError(I18N_KEYS.policy_name_length_2_20, {
      code: 4,
      details: {
        length: value.length,
        min: FIELD_LIMITS.policyNameMin,
        max: FIELD_LIMITS.policyNameMax,
      },
    });
  }
}

export function assertSemverLike(version: string): void {
  if (!/^\d+\.\d+\.\d+([.-][\w.-]+)?$/.test(version)) {
    throw cliError(I18N_KEYS.freelog_versioning, {
      code: 4,
      params: { version },
      hint: '使用 semver，如 1.0.0',
    });
  }
}

/** dep add/update：versionRange 须为 semver 可解析范围（含 *、^、>= 等） */
export function assertValidVersionRange(range: string | undefined): void {
  if (!range?.trim()) {
    throw cliError(I18N_KEYS.missing_version_range, { code: 4 });
  }
  const trimmed = range.trim();
  if (!semver.validRange(trimmed)) {
    throw cliError(I18N_KEYS.invalid_version_range, {
      code: 4,
      params: { range: trimmed },
      hint: '如 *、^1.0.0、>=1.0.0',
    });
  }
}
