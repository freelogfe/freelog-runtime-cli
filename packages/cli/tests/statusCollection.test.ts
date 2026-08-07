import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchResourceInfo: vi.fn(),
  lookRemoteVersionDraft: vi.fn(),
  stdoutWrite: vi.fn(),
}));

vi.mock('../src/core/auth.js', () => ({
  getCurrentAuth: () => ({
    token: 'token',
    userId: 101,
    username: 'alice',
    environment: 'dev',
  }),
}));

vi.mock('../src/core/env.js', () => ({
  getCliEnv: () => 'dev',
  getApiBaseURL: () => 'https://api.devfreelog.com',
}));

vi.mock('../src/core/command.js', () => ({
  applyCommandFlags: () => undefined,
  handleCommandError: (error: unknown) => {
    throw error;
  },
}));

vi.mock('../src/services/sync/index.js', () => ({
  fetchResourceInfo: mocks.fetchResourceInfo,
  ownersMatch: (a: unknown, b: unknown) => String(a) === String(b),
}));

vi.mock('../src/services/draftService.js', () => ({
  lookRemoteVersionDraft: mocks.lookRemoteVersionDraft,
}));

import { writeCollectionProject } from '../src/config/project.js';
import { statusCommand } from '../src/commands/status.js';
import {
  fingerprintCollectionDraft,
  toCollectionDraftData,
} from '../src/adapters/collectionVersionDraftAdapter.js';

describe('status collection platform gates', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.fetchResourceInfo.mockReset();
    mocks.lookRemoteVersionDraft.mockReset();
    mocks.stdoutWrite.mockReset();
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      mocks.stdoutWrite(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('includes platform latest/status/policy info for collection-only projects', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-status-collection-'));
    writeCollectionProject(
      {
        resourceId: 'collection-1',
        resourceName: 'alice/album',
        resourceTitle: 'Album',
        resourceType: ['合集'],
        resourceTypeCode: 'collection',
        version: '1.0.0',
      },
      cwd,
    );

    mocks.fetchResourceInfo.mockResolvedValue({
      resourceId: 'collection-1',
      resourceName: 'alice/album',
      resourceTitle: 'Album',
      userId: 101,
      username: 'alice',
      latestVersion: '1.0.0',
      status: 4,
      policies: [
        { policyId: 'p1', policyName: 'free', status: 1 },
        { policyId: 'p2', policyName: 'off', status: 0 },
      ],
    });
    mocks.lookRemoteVersionDraft.mockResolvedValue({ exists: false });

    await statusCommand.run?.({ args: { cwd, json: true } } as never);

    const payload = JSON.parse(mocks.stdoutWrite.mock.calls[0][0]) as {
      platform: { latestVersion: string; status: number; enabledPolicyCount: number };
      owner: { matchLogin: boolean };
    };
    expect(payload.platform).toEqual({
      resourceId: 'collection-1',
      latestVersion: '1.0.0',
      status: 4,
      enabledPolicyCount: 1,
    });
    expect(payload.owner.matchLogin).toBe(true);
  });

  it('reports collection form draft fingerprint drift as draft_pull advice', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-status-collection-draft-'));
    const localCollection = {
      resourceId: 'collection-1',
      resourceName: 'alice/album',
      resourceTitle: 'Album',
      resourceType: ['合集'],
      resourceTypeCode: 'collection',
      version: '1.0.0',
      description: 'local draft A',
      draftSync: {
        lastFingerprint: fingerprintCollectionDraft(
          toCollectionDraftData({
            resourceName: 'alice/album',
            resourceType: ['合集'],
            resourceTypeCode: 'collection',
            resourceTitle: 'Album',
            version: '1.0.0',
            description: 'local draft A',
          }),
        ),
        lastRemoteUpdateDate: '2026-08-05T00:00:00.000Z',
      },
    };
    writeCollectionProject(localCollection, cwd);

    mocks.fetchResourceInfo.mockResolvedValue({
      resourceId: 'collection-1',
      resourceName: 'alice/album',
      resourceTitle: 'Album',
      userId: 101,
      username: 'alice',
      latestVersion: '1.0.0',
      status: 4,
      policies: [],
    });
    mocks.lookRemoteVersionDraft.mockResolvedValue({
      exists: true,
      updateDate: '2026-08-05T00:01:00.000Z',
      draftData: toCollectionDraftData({
        resourceName: 'alice/album',
        resourceType: ['合集'],
        resourceTypeCode: 'collection',
        resourceTitle: 'Album',
        version: '1.0.0',
        description: 'remote draft B',
      }),
    });

    await statusCommand.run?.({ args: { cwd, json: true } } as never);

    const payload = JSON.parse(mocks.stdoutWrite.mock.calls[0][0]) as {
      collection: {
        platformFormDraft: { exists: boolean; fingerprint: string };
        draftAdvice: string;
        draftAdviceHint: string;
      };
    };
    expect(payload.collection.platformFormDraft.exists).toBe(true);
    expect(payload.collection.draftAdvice).toBe('draft_pull');
    expect(payload.collection.draftAdviceHint).toContain('draft pull --collection');
  });
});
