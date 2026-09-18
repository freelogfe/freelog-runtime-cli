import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  info: vi.fn(),
  releaseCreate: undefined as (() => void) | undefined,
}));

vi.mock('../src/core/auth.js', () => ({
  requireAuth: () => ({ userId: 101, username: 'alice' }),
}));
vi.mock('../src/core/command.js', () => ({
  assertExplicitEnvForWriteOperation: vi.fn(),
}));
vi.mock('../src/services/typeService.js', () => ({
  assertResourceTypeCode: vi.fn(async () => ({ resourceTypeCode: 'RT005001' })),
}));
vi.mock('../src/services/collection/internal.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/collection/internal.js')>();
  return {
    ...actual,
    hydrateCollectionTypeProperties: vi.fn(async (value: unknown) => value),
  };
});
vi.mock('../src/platform/index.js', () => ({
  unwrapData: (value: { data?: unknown } | unknown) =>
    value && typeof value === 'object' && 'data' in value ? value.data : value,
  FServiceAPI: {
    Resource: {
      info: mocks.info,
      create: mocks.create,
    },
  },
}));

import { createCollection } from '../src/services/collection/create.js';

const tempDirs: string[] = [];

afterEach(() => {
  mocks.releaseCreate?.();
  mocks.releaseCreate = undefined;
  vi.clearAllMocks();
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('collection create project lock', () => {
  it('serializes an empty-project create and prevents a concurrent duplicate remote create', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-collection-create-lock-'));
    tempDirs.push(cwd);
    mocks.info.mockResolvedValue(null);
    mocks.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          mocks.releaseCreate = () =>
            resolve({
              data: {
                resourceId: 'collection-1',
                resourceName: 'alice/demo',
                resourceType: ['collection'],
                resourceTypeCode: 'RT005001',
                resourceTitle: 'Demo',
              },
            });
        }),
    );

    const first = createCollection({ cwd, title: 'Demo', typeCode: 'RT005001' });
    await Promise.resolve();
    const second = createCollection({ cwd, title: 'Demo', typeCode: 'RT005001' });
    await expect(second).rejects.toThrow(/另一个 CLI 进程|locked/i);
    mocks.releaseCreate!();
    await expect(first).resolves.toMatchObject({ resourceId: 'collection-1' });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
