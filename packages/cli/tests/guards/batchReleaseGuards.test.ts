import { describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/core/errors.js';
import { consola } from 'consola';
import {
  assertBatchFileCount,
  assertCollectionItemAddCount,
  confirmBatchReleaseWithoutPolicies,
  countPreparedWithoutPolicies,
  CREATE_BATCH_CHUNK_SIZE,
  warnBatchChunkingIfNeeded,
} from '../../src/services/shared/guards/index.js';
import { bootstrapCliI18nSync } from '../../src/i18n/index.js';

vi.mock('../../src/core/tty.js', () => ({
  isInteractive: (yes?: boolean) => yes !== true && yes !== false,
}));

describe('batchReleaseGuards', () => {
  it('strict batch limit throws over chunk size', () => {
    expect(() => assertBatchFileCount(CREATE_BATCH_CHUNK_SIZE + 1, true)).toThrow(CliError);
    expect(() => assertBatchFileCount(CREATE_BATCH_CHUNK_SIZE, true)).not.toThrow();
  });

  it('warns when chunking is needed', () => {
    const warn = vi.spyOn(consola, 'warn').mockImplementation(() => undefined);
    bootstrapCliI18nSync('zh_CN');
    warnBatchChunkingIfNeeded(25);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('collection item add limit', () => {
    expect(() => assertCollectionItemAddCount(101)).toThrow(CliError);
    expect(() => assertCollectionItemAddCount(100)).not.toThrow();
  });

  it('counts prepared items without policies', () => {
    expect(
      countPreparedWithoutPolicies([
        { policies: [] },
        { policies: [{ policyId: 'p1' }] },
        {},
      ]),
    ).toBe(2);
  });

  it('non-interactive batch without policies needs --yes', async () => {
    bootstrapCliI18nSync('zh_CN');
    await expect(
      confirmBatchReleaseWithoutPolicies({ withoutPolicyCount: 2, yes: false }),
    ).rejects.toThrow(CliError);
  });
});
