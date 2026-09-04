import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as p from '@clack/prompts';
import { setCliEnv } from '../src/core/env.js';
import {
  createSessionContext,
  createSessionStore,
  rebindSessionStore,
} from '../src/services/interactive/context.js';

const commandMocks = vi.hoisted(() => ({
  logAuthContextIfInteractive: vi.fn(),
  assertExplicitEnvForWriteOperation: vi.fn(),
}));

const serviceMocks = vi.hoisted(() => ({
  fetchResourceInfo: vi.fn(),
  updateListing: vi.fn(),
  searchResources: vi.fn(),
  applySessionPublishIntent: vi.fn(),
  publishVersion: vi.fn(),
  ensureOperationContext: vi.fn(),
}));

vi.mock('../src/core/command.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/command.js')>();
  return {
    ...actual,
    logAuthContextIfInteractive: commandMocks.logAuthContextIfInteractive,
    assertExplicitEnvForWriteOperation: commandMocks.assertExplicitEnvForWriteOperation,
  };
});

vi.mock('../src/services/sync/fetch.js', () => ({
  fetchResourceInfo: serviceMocks.fetchResourceInfo,
}));

vi.mock('../src/services/resourceSearchService.js', () => ({
  searchResources: serviceMocks.searchResources,
}));

vi.mock('../src/services/resourceService.js', () => ({
  updateListing: serviceMocks.updateListing,
}));

vi.mock('../src/services/updateListingWizard.js', () => ({
  runUpdateListingWizard: vi.fn(async () => ({ title: 'New Title' })),
}));

vi.mock('../src/services/resource/index.js', () => ({
  applySessionPublishIntent: serviceMocks.applySessionPublishIntent,
  createThenPublish: vi.fn(),
  publishVersion: serviceMocks.publishVersion,
}));

vi.mock('../src/services/sync/operationContext.js', () => ({
  ensureOperationContext: serviceMocks.ensureOperationContext,
}));

vi.mock('../src/services/publishFileHints.js', () => ({
  infoPublishFileConstraints: vi.fn(async () => undefined),
}));

vi.mock('@clack/prompts', () => ({
  isCancel: (value: unknown) => value === Symbol.for('cancel'),
  select: vi.fn(),
  text: vi.fn(),
  multiselect: vi.fn(),
  confirm: vi.fn(async () => true),
  group: vi.fn(),
  password: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

import { confirmInteractiveWrite } from '../src/services/interactive/interactiveWrite.js';
import {
  bindSessionResource,
  pickSessionResource,
  sessionActionPolicyMenu,
  sessionActionUpdateListing,
} from '../src/services/interactive/sessionActions.js';
import { runSessionPublishWizard } from '../src/services/interactive/runSessionPublishWizard.js';

describe('interactive session context', () => {
  it('createSessionStore binds resourceId', () => {
    const store = createSessionStore('res-abc');
    expect(store.resolveResourceId()).toBe('res-abc');
    expect(store.mode()).toBe('session');
  });

  it('rebindSessionStore rebuilds EphemeralStore and clears title', () => {
    const ctx = createSessionContext('res-old');
    ctx.resourceTitle = 'Old Title';
    rebindSessionStore(ctx, 'res-new');
    expect(ctx.resourceId).toBe('res-new');
    expect(ctx.resourceTitle).toBeUndefined();
    expect(ctx.store.resolveResourceId()).toBe('res-new');
  });
});

describe('confirmInteractiveWrite', () => {
  beforeEach(() => {
    commandMocks.logAuthContextIfInteractive.mockClear();
    commandMocks.assertExplicitEnvForWriteOperation.mockClear();
    vi.mocked(p.confirm).mockResolvedValue(true);
  });

  it('logs auth context before confirm', async () => {
    const ok = await confirmInteractiveWrite('确认？');
    expect(ok).toBe(true);
    expect(commandMocks.assertExplicitEnvForWriteOperation).toHaveBeenCalled();
    expect(commandMocks.logAuthContextIfInteractive).toHaveBeenCalled();
  });
});

describe('interactive session actions', () => {
  beforeEach(() => {
    setCliEnv('dev');
    serviceMocks.fetchResourceInfo.mockReset();
    serviceMocks.updateListing.mockReset();
    serviceMocks.searchResources.mockReset();
    serviceMocks.applySessionPublishIntent.mockReset();
    serviceMocks.publishVersion.mockReset();
    serviceMocks.ensureOperationContext.mockReset();
    serviceMocks.updateListing.mockResolvedValue({ resourceTitle: 'New Title' });
    serviceMocks.applySessionPublishIntent.mockResolvedValue(undefined);
    serviceMocks.publishVersion.mockResolvedValue({
      version: '1.0.1',
      filename: 'demo.zip',
    });
    serviceMocks.ensureOperationContext.mockResolvedValue({
      platform: { latestVersion: '1.0.0' },
      resource: { resourceTypeCode: 'RT005001' },
    });
    vi.mocked(p.select).mockReset();
    vi.mocked(p.text).mockReset();
  });

  it('bindSessionResource rebinds store and sets title from platform', async () => {
    serviceMocks.fetchResourceInfo.mockResolvedValue({
      resourceId: 'res-1',
      resourceTitle: 'Demo Resource',
      latestVersion: '1.0.0',
    });
    const ctx = createSessionContext();
    await bindSessionResource(ctx, 'res-1');
    expect(ctx.resourceId).toBe('res-1');
    expect(ctx.resourceTitle).toBe('Demo Resource');
    expect(ctx.store.resolveResourceId()).toBe('res-1');
  });

  it('pickSessionResource search path binds selected resource', async () => {
    serviceMocks.searchResources.mockResolvedValue([
      {
        resourceId: 'res-search',
        resourceName: 'alice/demo',
        resourceTitle: 'Search Hit',
        latestVersion: '2.0.0',
      },
    ]);
    serviceMocks.fetchResourceInfo.mockResolvedValue({
      resourceId: 'res-search',
      resourceTitle: 'Search Hit',
      latestVersion: '2.0.0',
    });

    vi.mocked(p.select)
      .mockResolvedValueOnce('search')
      .mockResolvedValueOnce('res-search');
    vi.mocked(p.text).mockResolvedValueOnce('demo');

    const ctx = createSessionContext();
    await pickSessionResource(ctx);

    expect(serviceMocks.searchResources).toHaveBeenCalledWith({ query: 'demo' });
    expect(ctx.resourceId).toBe('res-search');
    expect(ctx.store.resolveResourceId()).toBe('res-search');
  });

  it('sessionActionUpdateListing calls updateListing on confirmed wizard result', async () => {
    const ctx = createSessionContext('res-update');
    await sessionActionUpdateListing(ctx);
    expect(commandMocks.logAuthContextIfInteractive).toHaveBeenCalled();
    expect(serviceMocks.updateListing).toHaveBeenCalledWith(
      expect.objectContaining({
        store: ctx.store,
        title: 'New Title',
      }),
    );
  });

  it('sessionActionPolicyMenu keeps Console template flow before advanced file apply', async () => {
    vi.mocked(p.select).mockResolvedValueOnce('back');

    const ctx = createSessionContext('res-policy');
    await sessionActionPolicyMenu(ctx);

    const firstSelect = vi.mocked(p.select).mock.calls[0]?.[0];
    expect(firstSelect?.message).toBe('策略');
    expect(firstSelect?.options.map((option) => option.value)).toEqual([
      'list',
      'template-list',
      'template-apply',
      'set',
      'apply-file',
      'back',
    ]);
  });

  it('runSessionPublishWizard applies intent and publishes for existing resource', async () => {
    const tmpFile = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-publish-file-'));
    const filePath = path.join(tmpFile, 'pkg.zip');
    fs.writeFileSync(filePath, 'bytes', 'utf8');

    vi.mocked(p.select)
      .mockResolvedValueOnce('file')
      .mockResolvedValueOnce('bump');
    vi.mocked(p.text)
      .mockResolvedValueOnce(filePath)
      .mockResolvedValueOnce('');

    const ctx = createSessionContext('res-existing');
    const result = await runSessionPublishWizard(ctx);

    expect(result?.version).toBe('1.0.1');
    expect(serviceMocks.applySessionPublishIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        store: ctx.store,
        file: filePath,
        bump: true,
      }),
    );
    expect(serviceMocks.publishVersion).toHaveBeenCalledWith({ store: ctx.store });
  });
});

describe('session export via store', () => {
  let target: string;

  beforeEach(() => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-session-export-'));
  });

  it('exportProject writes 00 shell from EphemeralStore', () => {
    const ctx = createSessionContext('res-export');
    ctx.store.saveResource({
      resourceId: 'res-export',
      resourceName: 'alice/export',
      resourceTitle: 'Export',
      resourceTypeCode: 'RT005001',
    });
    ctx.store.saveVersion({ version: '1.0.0', filePath: 'dist' });
    const exported = ctx.store.exportProject(target);
    expect(fs.existsSync(path.join(exported, 'freelog.manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(exported, '.freelog', 'state.json'))).toBe(true);
  });
});
