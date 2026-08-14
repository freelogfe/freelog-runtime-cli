import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveManifest, saveState, createEmptyState } from '../src/config/project/index.js';
import { setCliEnv } from '../src/core/env.js';
import { assertStudioOwner } from '../src/services/interactive/context.js';

const batchMocks = vi.hoisted(() => ({
  createOneResource: vi.fn(),
  writeItemConfigs: vi.fn(),
}));

const preflightMocks = vi.hoisted(() => ({
  summarizePublishPreflight: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('../src/core/auth.js', () => ({
  requireAuth: () => ({ userId: 101, username: 'alice', token: 't', environment: 'dev' }),
}));

vi.mock('../src/platform/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/index.js')>();
  return {
    ...actual,
    getSHA1Hash: vi.fn(async () => 'a'.repeat(40)),
  };
});

vi.mock('../src/services/typeService.js', () => ({
  assertLeafResourceTypeCode: vi.fn(async () => ({ code: 'RT005001', name: '图片' })),
}));

vi.mock('../src/services/resourceTypeCapabilities.js', () => ({
  assertLocalFileAllowedByType: vi.fn(),
  describeTypeFileSizeLimit: vi.fn(),
}));

vi.mock('../src/services/shared/guards/index.js', () => ({
  assertSha1PublishAllowed: vi.fn(async () => undefined),
}));

vi.mock('../src/services/batch/prepare.js', () => ({
  applyGeneratedResourceNames: vi.fn(async (items: unknown[]) => items),
  createOneResource: batchMocks.createOneResource,
  resolveExistingImportBySha1: vi.fn(() => null),
  resolveInitialBatchResourceName: vi.fn((_name: unknown, fallback: string) => fallback),
  resolveUniqueSubdir: vi.fn((_root: string, name: string) => path.join(_root, name)),
  writeItemConfigs: batchMocks.writeItemConfigs,
}));

vi.mock('../src/services/resource/publishVersion.js', () => ({
  computeBumpedVersion: vi.fn(() => '1.0.1'),
  publishVersion: vi.fn(async () => ({
    version: '1.0.1',
    filename: 'demo.mp4',
    fileSha1: 'a'.repeat(40),
  })),
}));

vi.mock('../src/services/sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/sync/index.js')>();
  return {
    ...actual,
    ensureSynced: vi.fn(async ({ store }) => ({
      resource: {
        resourceId: store.loadResource().resourceId || 'res-studio',
        resourceName: 'alice/demo',
        resourceTypeCode: 'RT005001',
        userId: 101,
        username: 'alice',
      },
      info: { latestVersion: '1.0.0' },
      version: { version: '1.0.0' },
    })),
  };
});

vi.mock('../src/services/preflightSummary.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/preflightSummary.js')>();
  return {
    ...actual,
    summarizePublishPreflight: preflightMocks.summarizePublishPreflight,
  };
});

vi.mock('../src/services/interactive/interactiveWrite.js', () => ({
  confirmInteractiveWrite: preflightMocks.confirm,
  confirmInteractiveOffline: vi.fn(async () => true),
}));

vi.mock('../src/services/publishFileHints.js', () => ({
  infoPublishFileConstraints: vi.fn(async () => undefined),
}));

vi.mock('@clack/prompts', () => {
  const cancel = Symbol.for('cancel');
  return {
    isCancel: (value: unknown) => value === cancel,
    select: vi.fn(async (opts: { options?: Array<{ value: string }> }) => opts.options?.[0]?.value),
    text: vi.fn(async ({ message }: { message: string }) => {
      if (message.includes('类型')) return 'RT005001';
      return '';
    }),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  };
});

import { publishVersion } from '../src/services/resource/publishVersion.js';
import {
  listFreelogSubdirs,
  studioActionPublish,
} from '../src/services/interactive/studioActions.js';
import { studioPublishOneFile } from '../src/services/interactive/studioPublish.js';
import { projectStoreFromCwd } from '../src/services/store/projectStore.js';

function seedStudioProject(cwd: string, owner: { userId: number; username: string }) {
  saveManifest(
    {
      schemaVersion: 1,
      subject: 'resource',
      identity: { name: 'alice/demo' },
      resource: { typeCode: 'RT005001', title: 'Demo' },
      version: { version: '1.0.0', filePath: 'demo.mp4', description: '' },
      policies: [],
      collection: null,
    },
    cwd,
  );
  saveState(
    {
      ...createEmptyState('resource'),
      env: 'dev',
      resource: {
        resourceId: 'res-studio',
        resourceName: 'alice/demo',
        owner: { userId: owner.userId, username: owner.username },
      },
    },
    cwd,
  );
}

describe('assertStudioOwner', () => {
  let projectDir: string;

  beforeEach(() => {
    setCliEnv('dev');
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-studio-owner-'));
    seedStudioProject(projectDir, { userId: 101, username: 'alice' });
  });

  it('passes when auth userId matches project owner', () => {
    expect(() => assertStudioOwner(projectDir)).not.toThrow();
  });

  it('rejects when auth userId mismatches project owner with code 2', () => {
    seedStudioProject(projectDir, { userId: 999, username: 'bob' });
    expect(() => assertStudioOwner(projectDir)).toThrow(
      expect.objectContaining({ code: 2 }),
    );
  });
});

describe('listFreelogSubdirs', () => {
  it('returns only directories with valid Freelog resource projects', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-studio-list-'));
    const valid = path.join(root, 'valid-proj');
    const empty = path.join(root, 'empty-dir');
    fs.mkdirSync(valid, { recursive: true });
    fs.mkdirSync(empty, { recursive: true });
    seedStudioProject(valid, { userId: 101, username: 'alice' });

    expect(listFreelogSubdirs(root)).toEqual([valid]);
  });
});

describe('studioPublishOneFile', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    setCliEnv('dev');
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-studio-publish-'));
    fs.writeFileSync(path.join(workspaceRoot, 'clip.mp4'), 'video-bytes', 'utf8');
    batchMocks.createOneResource.mockResolvedValue({
      resourceId: 'res-new',
      resourceName: 'alice/clip',
      versionId: 'ver-1',
    });
    batchMocks.writeItemConfigs.mockReset();
  });

  it('writes userId into subproject via writeItemConfigs', async () => {
    const subdir = await studioPublishOneFile(workspaceRoot);
    expect(subdir).toBeTruthy();
    expect(batchMocks.writeItemConfigs).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 101,
        username: 'alice',
        resourceId: 'res-new',
      }),
    );
  });
});

describe('studioActionPublish', () => {
  beforeEach(() => {
    setCliEnv('dev');
    preflightMocks.summarizePublishPreflight.mockReset();
    preflightMocks.confirm.mockReset();
    preflightMocks.summarizePublishPreflight.mockResolvedValue(['发行预检通过']);
    preflightMocks.confirm.mockResolvedValue(true);
    vi.mocked(publishVersion).mockClear();
  });

  it('runs publish preflight before confirm and publishVersion', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-studio-preflight-'));
    seedStudioProject(projectDir, { userId: 101, username: 'alice' });

    await studioActionPublish(projectDir);

    expect(preflightMocks.summarizePublishPreflight).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: projectDir }),
    );
    expect(preflightMocks.confirm).toHaveBeenCalled();
    expect(publishVersion).toHaveBeenCalled();
  });
});

describe('studio maintain publish', () => {
  it('publishVersion is callable from project store after owner gate', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-studio-maintain-'));
    seedStudioProject(projectDir, { userId: 101, username: 'alice' });
    assertStudioOwner(projectDir);
    const store = projectStoreFromCwd(projectDir);
    await publishVersion({ store });
    expect(publishVersion).toHaveBeenCalledWith(expect.objectContaining({ store }));
  });
});
