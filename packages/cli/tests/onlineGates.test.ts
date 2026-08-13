import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformResourceInfo } from '../src/services/sync/index.js';

vi.mock('../src/services/sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/sync/index.js')>();
  return {
    ...actual,
    ensureSynced: vi.fn(async () => ({
      resource: { resourceId: 'resource-id' },
      info: { resourceId: 'resource-id' },
    })),
    fetchResourceInfo: vi.fn(async () => ({
      resourceId: 'resource-id',
      status: 4,
      latestVersion: '1.0.0',
      policies: [],
    })),
  };
});

vi.mock('../src/services/collection/owner.js', () => ({
  ensureCollectionSynced: vi.fn(async () => {
    throw new Error('collection path should not be used for resource manifest');
  }),
}));

const { evaluateOnlineGates, onlineResource } = await import('../src/services/onlineService.js');
const { createResourceManifestTemplate, writeResourceProject } = await import('../src/config/project.js');
const { projectStoreFromCwd } = await import('../src/services/store/projectStore.js');

function info(partial: Partial<PlatformResourceInfo>): PlatformResourceInfo {
  return { resourceId: 'r1', ...partial };
}

describe('evaluateOnlineGates (#15b)', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

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

  it('passes only with latestVersion and â? enabled policy', () => {
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

  it('routes a resource manifest to resource online gates, not collection gates', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-online-resource-'));
    writeResourceProject(
      createResourceManifestTemplate({
        resourceName: 'r',
        resourceTypeCode: 'RT005001',
        resourceTitle: 'r',
      }),
      tempDir,
    );

    await expect(onlineResource({ store: projectStoreFromCwd(tempDir) })).rejects.toMatchObject({
      message: expect.stringMatching(/授权策略/),
    });
  });
});
