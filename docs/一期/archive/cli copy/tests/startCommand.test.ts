import { runCommand } from 'citty';
import * as p from '@clack/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const statusMocks = vi.hoisted(() => ({
  buildProjectStatus: vi.fn(),
}));

const shellMocks = vi.hoisted(() => ({
  runCollectionShell: vi.fn(),
  runProjectShell: vi.fn(),
  runSessionShell: vi.fn(),
  runStudioShell: vi.fn(),
  runBatchImportWizard: vi.fn(),
}));

vi.mock('../src/services/statusService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/statusService.js')>();
  return {
    ...actual,
    buildProjectStatus: statusMocks.buildProjectStatus,
  };
});

vi.mock('../src/services/interactive/sessionShell.js', () => ({
  runSessionShell: shellMocks.runSessionShell,
}));

vi.mock('../src/services/interactive/projectShell.js', () => ({
  runProjectShell: shellMocks.runProjectShell,
}));

vi.mock('../src/services/interactive/collectionShell.js', () => ({
  runCollectionShell: shellMocks.runCollectionShell,
}));

vi.mock('../src/services/interactive/studioShell.js', () => ({
  runStudioShell: shellMocks.runStudioShell,
}));

vi.mock('../src/services/batchImportWizard.js', () => ({
  runBatchImportWizard: shellMocks.runBatchImportWizard,
}));

vi.mock('@clack/prompts', () => ({
  isCancel: (value: unknown) => value === Symbol.for('cancel'),
  select: vi.fn(),
}));

import { startCommand } from '../src/commands/start.js';
import type { StatusPayload } from '../src/services/statusService.js';

function status(overrides: Partial<StatusPayload> = {}): StatusPayload {
  return {
    ok: true,
    environment: 'dev',
    apiBaseURL: 'https://api.devfreelog.com',
    loggedIn: true,
    auth: null,
    owner: null,
    sync: 'unknown',
    platform: null,
    platformVersionDraft: null,
    localDraftSync: null,
    draftAdvice: null,
    draftAdviceHint: null,
    local: {
      resourceId: null,
      version: null,
      runtimeVersion: null,
      filePath: null,
    },
    collection: null,
    configs: {
      resource: null,
      version: null,
      collection: null,
    },
    ...overrides,
  };
}

function setTty(value: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value });
}

describe('start command interactive routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTty(true);
    statusMocks.buildProjectStatus.mockResolvedValue(status());
  });

  it('enters session for online maintenance instead of only printing commands', async () => {
    vi.mocked(p.select).mockResolvedValueOnce('maintain-online');

    await runCommand(startCommand, { rawArgs: ['--env', 'dev'] });

    expect(shellMocks.runSessionShell).toHaveBeenCalledOnce();
    expect(shellMocks.runStudioShell).not.toHaveBeenCalled();
  });

  it('enters the local project maintenance shell for update-local', async () => {
    statusMocks.buildProjectStatus.mockResolvedValueOnce(
      status({
        configs: { resource: {} as never, version: null, collection: null },
      }),
    );
    vi.mocked(p.select).mockResolvedValueOnce('update-local');

    await runCommand(startCommand, { rawArgs: ['--env', 'dev'] });

    expect(shellMocks.runProjectShell).toHaveBeenCalledWith(expect.any(String));
  });

  it('enters the collection maintenance shell for existing collection projects', async () => {
    statusMocks.buildProjectStatus.mockResolvedValueOnce(
      status({
        configs: { resource: null, version: null, collection: {} as never },
      }),
    );
    vi.mocked(p.select).mockResolvedValueOnce('collection');

    await runCommand(startCommand, { rawArgs: ['--env', 'dev'] });

    expect(shellMocks.runCollectionShell).toHaveBeenCalledWith(expect.any(String));
  });

  it('lets the user choose studio from the session/studio entry', async () => {
    vi.mocked(p.select)
      .mockResolvedValueOnce('session-studio')
      .mockResolvedValueOnce('studio');

    await runCommand(startCommand, { rawArgs: ['--env', 'dev'] });

    expect(shellMocks.runStudioShell).toHaveBeenCalledOnce();
    expect(shellMocks.runSessionShell).not.toHaveBeenCalled();
  });

  it('enters the batch import wizard for batch-import', async () => {
    vi.mocked(p.select).mockResolvedValueOnce('batch-import');

    await runCommand(startCommand, { rawArgs: ['--env', 'dev'] });

    expect(shellMocks.runBatchImportWizard).toHaveBeenCalledWith({
      cwd: expect.any(String),
    });
  });
});
