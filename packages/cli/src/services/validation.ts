import { CliError } from '../core/errors.js';

/** 字段约束 → docs/新方案/开发设计/03-字段约束.md */
export const FIELD_LIMITS = {
  resourceTitleMax: 100,
  tagsMaxCount: 20,
  tagMaxLength: 20,
  policyNameMin: 2,
  policyNameMax: 20,
} as const;

export function assertResourceTitle(title: string | undefined, required = false): void {
  if (title === undefined || title === '') {
    if (required) throw new CliError('标题不能为空', { code: 4 });
    return;
  }
  const t = title.trim();
  if (!t) throw new CliError('标题不能为空', { code: 4 });
  if (t.length > FIELD_LIMITS.resourceTitleMax) {
    throw new CliError(`标题长度不能超过 ${FIELD_LIMITS.resourceTitleMax}`, {
      code: 4,
      details: { length: t.length, max: FIELD_LIMITS.resourceTitleMax },
    });
  }
}

export function assertTags(tags: string[] | undefined): void {
  if (!tags) return;
  if (tags.length > FIELD_LIMITS.tagsMaxCount) {
    throw new CliError(`标签数量不能超过 ${FIELD_LIMITS.tagsMaxCount}`, {
      code: 4,
      details: { count: tags.length, max: FIELD_LIMITS.tagsMaxCount },
    });
  }
  for (const tag of tags) {
    if (!tag || !tag.trim()) {
      throw new CliError('标签不能为空字符串', { code: 4 });
    }
    if (tag.length > FIELD_LIMITS.tagMaxLength) {
      throw new CliError(`单个标签长度不能超过 ${FIELD_LIMITS.tagMaxLength}`, {
        code: 4,
        details: { tag, max: FIELD_LIMITS.tagMaxLength },
      });
    }
  }
}

export function assertSemverLike(version: string): void {
  if (!/^\d+\.\d+\.\d+([.-][\w.-]+)?$/.test(version)) {
    throw new CliError(`非法版本号: ${version}`, {
      code: 4,
      hint: '使用 semver，如 1.0.0',
    });
  }
}
