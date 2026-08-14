import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveManifest, saveState, createEmptyState } from '../src/config/project/index.js';
import { setCliEnv } from '../src/core/env.js';
import { assertStudioOwner } from '../src/services/interactive/context.js';

const batchMocks = vi.hoisted(() => ({
  createOneResource: vi.fn(),
  ensureVersionAfterCreateBatch: vi.fn(),
  writeItemConfigs: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  current: { userId: 101 as number | string | undefined, username: 'alice' as string | undefined },
}));

const storageMocks = vi.hoisted(() => ({
  uploadFileIfNeeded: vi.fn(),
}));

const platformMocks = vi.hoisted(() => ({
  getSHA1Hash: vi.fn(),
  info: vi.fn(),
  getVersionListByResourceID: vi.fn(),
  resourceVersionInfo1: vi.fn(),
}));

const preflightMocks = vi.hoisted(() => ({
  summarizePublishPreflight: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('../src/core/auth.js', () => ({
  requireAuth: () => ({ ...authMocks.current, token: 't', environment: 'dev' }),
}));

vi.mock('../src/services/storageUpload.js', () => ({
  uploadFileIfNeeded: storageMocks.uploadFileIfNeeded,
}));

vi.mock('../src/platform/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/index.js')>();
  return {
    ...actual,
    getSHA1Hash: platformMocks.getSHA1Hash,
    FServiceAPI: {
      ...actual.FServiceAPI,
      Resource: {
        ...actual.FServiceAPI.Resource,
        info: platformMocks.info,
        getVersionListByResourceID: platformMocks.getVersionListByResourceID,
        resourceVersionInfo1: platformMocks.resourceVersionInfo1,
      },
    },
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
  ensureVersionAfterCreateBatch: batchMocks.ensureVersionAfterCreateBatch,
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
import { loadBatchReport } from '../src/services/batch/report.js';
import {
  listRootMediaFiles,
  studioPublishOneFile,
} from '../src/services/interactive/studioPublish.js';
import { reconcileStudioPublish } from '../src/services/interactive/studioRecovery.js';
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
    vi.spyOn(consola, 'error').mockImplementation(() => undefined);
    setCliEnv('dev');
    authMocks.current = { userId: 101, username: 'alice' };
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-studio-publish-'));
    fs.writeFileSync(path.join(workspaceRoot, 'clip.mp4'), 'video-bytes', 'utf8');
    batchMocks.createOneResource.mockResolvedValue({
      resourceId: 'res-new',
      resourceName: 'alice/clip',
      versionId: 'ver-1',
    });
    batchMocks.createOneResource.mockClear();
    batchMocks.ensureVersionAfterCreateBatch.mockReset();
    batchMocks.ensureVersionAfterCreateBatch.mockResolvedValue({ versionId: 'ver-1' });
    batchMocks.writeItemConfigs.mockReset();
    storageMocks.uploadFileIfNeeded.mockReset();
    storageMocks.uploadFileIfNeeded.mockResolvedValue('uploaded');
    platformMocks.getSHA1Hash.mockReset();
    platformMocks.getSHA1Hash.mockResolvedValue('a'.repeat(40));
    platformMocks.info.mockReset();
    platformMocks.info.mockResolvedValue({
      ret: 0,
      data: {
        resourceId: 'res-reconciled',
        resourceName: 'alice/clip',
        resourceTypeCode: 'RT005001',
        userId: 101,
        username: 'alice',
        latestVersion: '1.0.0',
      },
    });
    platformMocks.getVersionListByResourceID.mockReset();
    platformMocks.getVersionListByResourceID.mockResolvedValue({
      ret: 0,
      data: [{ version: '1.0.0', versionId: 'ver-reconciled' }],
    });
    platformMocks.resourceVersionInfo1.mockReset();
    platformMocks.resourceVersionInfo1.mockResolvedValue({
      ret: 0,
      data: { version: '1.0.0', versionId: 'ver-reconciled', fileSha1: 'a'.repeat(40) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads before remote create and returns auditable remote identity', async () => {
    const result = await studioPublishOneFile(workspaceRoot);
    expect(result).toMatchObject({
      subdir: expect.any(String),
      resourceId: 'res-new',
      resourceName: 'alice/clip',
      versionId: 'ver-1',
      reportPath: expect.any(String),
      outcome: 'created',
    });
    expect(storageMocks.uploadFileIfNeeded).toHaveBeenCalledWith(
      path.join(workspaceRoot, 'clip.mp4'),
      'a'.repeat(40),
    );
    expect(storageMocks.uploadFileIfNeeded.mock.invocationCallOrder[0]).toBeLessThan(
      batchMocks.createOneResource.mock.invocationCallOrder[0]!,
    );
    expect(batchMocks.writeItemConfigs).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 101,
        username: 'alice',
        resourceId: 'res-new',
      }),
    );
  });

  it('excludes credentials, internal files, configs, and .freelogignore matches from selection', async () => {
    fs.writeFileSync(path.join(workspaceRoot, '.freelog-auth'), 'credential', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'freelog.secret.config'), 'config', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'private.mov'), 'private', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, '.freelogignore'), 'private.mov\n', 'utf8');
    fs.mkdirSync(path.join(workspaceRoot, '.freelog'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, '.freelog', 'state.json'), '{}', 'utf8');
    fs.mkdirSync(path.join(workspaceRoot, '.git'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, '.git', 'config'), 'git', 'utf8');

    expect(listRootMediaFiles(workspaceRoot).map((file) => path.basename(file))).toEqual(['clip.mp4']);
    await expect(
      studioPublishOneFile(workspaceRoot, {
        filePath: path.join(workspaceRoot, '.freelog-auth'),
        resourceTypeCode: 'RT005001',
      }),
    ).rejects.toThrow(/只能发行工作区根目录/);
    expect(storageMocks.uploadFileIfNeeded).not.toHaveBeenCalled();
    expect(batchMocks.createOneResource).not.toHaveBeenCalled();
  });

  it('serializes same-process Studio publishes before either can create a duplicate resource', async () => {
    let releaseCreate: ((value: {
      resourceId: string;
      resourceName: string;
      versionId: string;
    }) => void) | undefined;
    batchMocks.createOneResource.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseCreate = resolve;
        }),
    );

    const first = studioPublishOneFile(workspaceRoot);
    await vi.waitFor(() => expect(batchMocks.createOneResource).toHaveBeenCalledTimes(1));

    await expect(studioPublishOneFile(workspaceRoot)).rejects.toMatchObject({ code: 2 });
    expect(batchMocks.createOneResource).toHaveBeenCalledTimes(1);
    expect(storageMocks.uploadFileIfNeeded).toHaveBeenCalledTimes(1);

    releaseCreate?.({
      resourceId: 'res-concurrent',
      resourceName: 'alice/clip',
      versionId: 'ver-concurrent',
    });
    await expect(first).resolves.toMatchObject({ resourceId: 'res-concurrent' });
  });

  it('rejects a live cross-process Studio lock before upload or remote create', async () => {
    const lock = path.join(workspaceRoot, '.freelog', 'tmp', 'project-write.lock');
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    const child = spawn(
      process.execPath,
      [
        '-e',
        `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(lock)},JSON.stringify({pid:process.pid})+'\\n');process.stdout.write('ready');setTimeout(()=>{},30000)`,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.stdout.once('data', () => resolve());
    });

    try {
      await expect(studioPublishOneFile(workspaceRoot)).rejects.toMatchObject({ code: 2 });
      expect(storageMocks.uploadFileIfNeeded).not.toHaveBeenCalled();
      expect(batchMocks.createOneResource).not.toHaveBeenCalled();
    } finally {
      child.kill();
    }
  });

  it('rejects missing numeric userId before upload or remote write', async () => {
    authMocks.current = { userId: undefined, username: 'alice' };

    await expect(studioPublishOneFile(workspaceRoot)).rejects.toMatchObject({ code: 2 });

    expect(storageMocks.uploadFileIfNeeded).not.toHaveBeenCalled();
    expect(batchMocks.createOneResource).not.toHaveBeenCalled();
  });

  it('recovers remote success after local write failure without creating a duplicate resource', async () => {
    batchMocks.writeItemConfigs.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    await expect(studioPublishOneFile(workspaceRoot)).rejects.toThrow('disk full');
    expect(batchMocks.createOneResource).toHaveBeenCalledTimes(1);

    batchMocks.writeItemConfigs.mockImplementation(() => undefined);
    const recovered = await studioPublishOneFile(workspaceRoot);

    expect(recovered).toMatchObject({
      resourceId: 'res-new',
      versionId: 'ver-1',
      outcome: 'recovered',
    });
    expect(batchMocks.ensureVersionAfterCreateBatch).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'clip.mp4' }),
      'res-new',
    );
    expect(batchMocks.createOneResource).toHaveBeenCalledTimes(1);
  });

  it('blocks recovery under a different account instead of writing the wrong owner', async () => {
    batchMocks.writeItemConfigs.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    await expect(studioPublishOneFile(workspaceRoot)).rejects.toThrow('disk full');

    authMocks.current = { userId: 202, username: 'bob' };
    await expect(studioPublishOneFile(workspaceRoot)).rejects.toMatchObject({ code: 2 });

    expect(batchMocks.createOneResource).toHaveBeenCalledTimes(1);
    expect(batchMocks.writeItemConfigs).toHaveBeenCalledTimes(1);
  });

  it('blocks automatic retry when create response outcome is unknown', async () => {
    batchMocks.createOneResource.mockRejectedValueOnce(new Error('socket closed'));

    await expect(studioPublishOneFile(workspaceRoot)).rejects.toThrow('socket closed');
    await expect(studioPublishOneFile(workspaceRoot)).rejects.toThrow(/远端结果未知/);

    expect(batchMocks.createOneResource).toHaveBeenCalledTimes(1);
  });

  it('marks an explicit HTTP 4xx as failed so a safe retry can create once more', async () => {
    let reportPath = '';
    batchMocks.createOneResource.mockRejectedValueOnce({ response: { status: 400 } });

    await expect(
      studioPublishOneFile(workspaceRoot, {
        onReportCreated: (value) => {
          reportPath = value;
        },
      }),
    ).rejects.toBeTruthy();
    expect(loadBatchReport(reportPath).items[0]).toMatchObject({
      stage: 'prepared',
      result: 'failed',
    });

    await expect(studioPublishOneFile(workspaceRoot)).resolves.toMatchObject({ outcome: 'created' });
    expect(batchMocks.createOneResource).toHaveBeenCalledTimes(2);
  });

  it('reconciles unknown as not-created and permits a normal retry', async () => {
    let reportPath = '';
    batchMocks.createOneResource.mockRejectedValueOnce(new Error('socket closed'));
    await expect(
      studioPublishOneFile(workspaceRoot, {
        onReportCreated: (value) => {
          reportPath = value;
        },
      }),
    ).rejects.toThrow('socket closed');

    const report = await reconcileStudioPublish({
      workspaceRoot,
      reportPath,
      resolution: 'confirmed-not-created',
    });
    expect(report.items[0]).toMatchObject({ result: 'failed', stage: 'prepared' });

    await expect(studioPublishOneFile(workspaceRoot)).resolves.toMatchObject({ outcome: 'created' });
    expect(batchMocks.createOneResource).toHaveBeenCalledTimes(2);
  });

  it('reconciles unknown as created and resumes locally without another create', async () => {
    let reportPath = '';
    batchMocks.createOneResource.mockRejectedValueOnce(new Error('socket closed'));
    await expect(
      studioPublishOneFile(workspaceRoot, {
        onReportCreated: (value) => {
          reportPath = value;
        },
      }),
    ).rejects.toThrow('socket closed');

    const report = await reconcileStudioPublish({
      workspaceRoot,
      reportPath,
      resolution: 'confirmed-created',
      resourceId: 'res-reconciled',
    });
    expect(report.items[0]).toMatchObject({
      result: 'remote_succeeded_local_pending',
      resourceId: 'res-reconciled',
      versionId: 'ver-reconciled',
    });

    await expect(studioPublishOneFile(workspaceRoot)).resolves.toMatchObject({
      outcome: 'recovered',
      resourceId: 'res-reconciled',
    });
    expect(batchMocks.createOneResource).toHaveBeenCalledTimes(1);
  });

  it('rejects a reconciled resourceId whose remote identity does not match the unknown request', async () => {
    let reportPath = '';
    batchMocks.createOneResource.mockRejectedValueOnce(new Error('socket closed'));
    await expect(
      studioPublishOneFile(workspaceRoot, {
        onReportCreated: (value) => {
          reportPath = value;
        },
      }),
    ).rejects.toThrow('socket closed');

    platformMocks.info.mockResolvedValueOnce({
      ret: 0,
      data: {
        resourceId: 'wrong-resource',
        resourceName: 'alice/another-resource',
        resourceTypeCode: 'RT005001',
        userId: 101,
        username: 'alice',
        latestVersion: '1.0.0',
      },
    });

    await expect(
      reconcileStudioPublish({
        workspaceRoot,
        reportPath,
        resolution: 'confirmed-created',
        resourceId: 'wrong-resource',
      }),
    ).rejects.toThrow(/授权名不匹配/);
    expect(loadBatchReport(reportPath).items[0]?.result).toBe('remote_outcome_unknown');
  });

  it('validates reconcile actor, environment, and current file SHA before changing unknown', async () => {
    let reportPath = '';
    batchMocks.createOneResource.mockRejectedValueOnce(new Error('socket closed'));
    await expect(
      studioPublishOneFile(workspaceRoot, {
        onReportCreated: (value) => {
          reportPath = value;
        },
      }),
    ).rejects.toThrow('socket closed');

    authMocks.current = { userId: 202, username: 'bob' };
    await expect(
      reconcileStudioPublish({
        workspaceRoot,
        reportPath,
        resolution: 'confirmed-not-created',
      }),
    ).rejects.toMatchObject({ code: 2 });

    authMocks.current = { userId: 101, username: 'alice' };
    setCliEnv('production');
    await expect(
      reconcileStudioPublish({
        workspaceRoot,
        reportPath,
        resolution: 'confirmed-not-created',
      }),
    ).rejects.toThrow(/拒绝跨环境对账/);

    setCliEnv('dev');
    platformMocks.getSHA1Hash.mockResolvedValueOnce('b'.repeat(40));
    await expect(
      reconcileStudioPublish({
        workspaceRoot,
        reportPath,
        resolution: 'confirmed-not-created',
      }),
    ).rejects.toThrow(/内容已变化/);
    expect(loadBatchReport(reportPath).items[0]?.result).toBe('remote_outcome_unknown');
  });

  it('blocks remote writes when the Studio recovery pointer is corrupt', async () => {
    const reportsDir = path.join(workspaceRoot, '.freelog', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'studio-latest.json'), '{broken', 'utf8');

    await expect(studioPublishOneFile(workspaceRoot)).rejects.toThrow(/无法验证 Studio 最近发行报告/);

    expect(batchMocks.createOneResource).not.toHaveBeenCalled();
  });

  it('recovers a created resource when version creation failed after resource identity was persisted', async () => {
    batchMocks.createOneResource.mockImplementationOnce(
      async (
        _prepared: unknown,
        onResourceCreated?: (remote: { resourceId: string; resourceName: string }) => void,
      ) => {
        onResourceCreated?.({ resourceId: 'res-partial', resourceName: 'alice/clip' });
        throw new Error('version request failed');
      },
    );

    await expect(studioPublishOneFile(workspaceRoot)).rejects.toThrow('version request failed');
    const recovered = await studioPublishOneFile(workspaceRoot);

    expect(recovered).toMatchObject({ resourceId: 'res-partial', outcome: 'recovered' });
    expect(batchMocks.ensureVersionAfterCreateBatch).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'clip.mp4' }),
      'res-partial',
    );
    expect(batchMocks.createOneResource).toHaveBeenCalledTimes(1);
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
