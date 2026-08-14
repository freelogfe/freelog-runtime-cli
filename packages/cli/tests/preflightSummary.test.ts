import { describe, expect, it } from 'vitest';
import { bootstrapCliI18nSync, I18N_KEYS, t } from '../src/i18n/index.js';
import { summarizeOnlineGates } from '../src/services/preflightSummary.js';
import type { PlatformResourceInfo } from '../src/services/sync/index.js';

bootstrapCliI18nSync(['node', 'vitest', '--lang', 'zh_CN']);

function info(partial: Partial<PlatformResourceInfo>): PlatformResourceInfo {
  return { resourceId: 'r1', ...partial };
}

describe('summarizeOnlineGates (P3 三分支)', () => {
  it('prioritizes msg_release_version_first when no latestVersion even with enabled policies', () => {
    const summary = summarizeOnlineGates(
      info({
        latestVersion: undefined,
        policies: [{ policyId: 'p1', status: 1 }],
      }),
    );
    expect(summary.gates.ok).toBe(false);
    expect(summary.failureKey).toBe(I18N_KEYS.msg_release_version_first);
    expect(summary.lines.join('\n')).toContain(t(I18N_KEYS.msg_release_version_first));
  });

  it('uses auth01 when latestVersion exists but zero policies', () => {
    const summary = summarizeOnlineGates(
      info({
        latestVersion: '1.0.0',
        policies: [],
      }),
    );
    expect(summary.failureKey).toBe(I18N_KEYS.msg_set_resource_avaliable_for_auth01);
    expect(summary.lines.join('\n')).toContain(t(I18N_KEYS.msg_set_resource_avaliable_for_auth01));
  });

  it('uses auth02 when policies exist but none enabled', () => {
    const summary = summarizeOnlineGates(
      info({
        latestVersion: '1.0.0',
        policies: [{ policyId: 'p1', status: 0 }],
      }),
    );
    expect(summary.failureKey).toBe(I18N_KEYS.msg_set_resource_avaliable_for_auth02);
    expect(summary.lines.join('\n')).toContain(t(I18N_KEYS.msg_set_resource_avaliable_for_auth02));
  });

  it('reports pass when gates ok', () => {
    const summary = summarizeOnlineGates(
      info({
        latestVersion: '1.0.0',
        policies: [{ policyId: 'p1', status: 1 }],
      }),
    );
    expect(summary.gates.ok).toBe(true);
    expect(summary.failureKey).toBeUndefined();
    expect(summary.lines.join('\n')).toContain('门禁检查通过');
  });
});
