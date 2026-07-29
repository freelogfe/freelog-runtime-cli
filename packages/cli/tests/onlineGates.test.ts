import { describe, expect, it } from 'vitest';
import { evaluateOnlineGates } from '../src/services/onlineService.js';
import type { PlatformResourceInfo } from '../src/services/syncService.js';

function info(partial: Partial<PlatformResourceInfo>): PlatformResourceInfo {
  return { resourceId: 'r1', ...partial };
}

describe('evaluateOnlineGates (#15b)', () => {
  it('fails when no latestVersion even if status already 1 (soft online)', () => {
    const gates = evaluateOnlineGates(
      info({
        status: 1,
        latestVersion: undefined,
        policies: [{ policyId: 'p1', status: 1 }],
      }),
    );
    expect(gates.ok).toBe(false);
    expect(gates.hasLatestVersion).toBe(false);
  });

  it('fails when no enabled policy even with latestVersion and status 1', () => {
    const gates = evaluateOnlineGates(
      info({
        status: 1,
        latestVersion: '1.0.0',
        policies: [{ policyId: 'p1', status: 0 }],
      }),
    );
    expect(gates.ok).toBe(false);
    expect(gates.enabledPolicyCount).toBe(0);
  });

  it('passes only with latestVersion and ≥1 enabled policy', () => {
    const gates = evaluateOnlineGates(
      info({
        status: 4,
        latestVersion: '1.0.0',
        policies: [
          { status: 0 },
          { status: 1 },
        ],
      }),
    );
    expect(gates.ok).toBe(true);
    expect(gates.enabledPolicyCount).toBe(1);
  });

  it('treats empty policies as fail', () => {
    expect(evaluateOnlineGates(info({ latestVersion: '1.0.0', policies: [] })).ok).toBe(false);
  });
});
