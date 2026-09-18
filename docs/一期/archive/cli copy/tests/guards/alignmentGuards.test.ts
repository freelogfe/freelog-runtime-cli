import { describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/core/errors.js';
import { bootstrapCliI18nSync, I18N_KEYS, t } from '../../src/i18n/index.js';
import {
  assertBatchFileCount,
  CREATE_BATCH_CHUNK_SIZE,
  warnBatchChunkingIfNeeded,
} from '../../src/services/shared/guards/index.js';
import { assertTags } from '../../src/services/validation.js';
import { assertNewPoliciesUnique } from '../../src/services/policyService.js';

vi.mock('../../src/config/project.js', () => ({
  tryLoadCollectionProject: vi.fn(() => null),
}));

describe('alignmentGuards', () => {
  it('batch strict limit uses Console message key', () => {
    bootstrapCliI18nSync('zh_CN');
    expect(t(I18N_KEYS.brr_submitresource_alert_limitation)).toContain('20');
    expect(() => assertBatchFileCount(21, true)).toThrow(CliError);
    expect(() => warnBatchChunkingIfNeeded(25)).not.toThrow();
  });

  it('validates tags shape', () => {
    expect(() => assertTags(['a', 'b'])).not.toThrow();
    expect(() => assertTags([''])).toThrow(CliError);
  });

  it('detects duplicate policy map entries', () => {
    expect(() =>
      assertNewPoliciesUnique([{ policyName: 'A' }], [{ policyName: 'A', policyText: 'x' }]),
    ).toThrow(CliError);
  });
});
