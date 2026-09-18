import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCollectionProject } from '../src/config/project/index.js';
import { setCliEnv } from '../src/core/env.js';

vi.mock('@clack/prompts', () => ({
  isCancel: (value: unknown) => value === Symbol.for('cancel'),
  select: vi.fn(),
  text: vi.fn(),
  multiselect: vi.fn(),
  confirm: vi.fn(async () => true),
  group: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

import { runCollectionShell } from '../src/services/interactive/collectionShell.js';

function setTty(value: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value });
}

function seedCollectionProject(cwd: string): void {
  saveCollectionProject(
    {
      resourceId: 'col-1',
      resourceName: 'alice/album',
      resourceType: [],
      resourceTypeCode: 'RT_COLLECTION',
      resourceTitle: 'Album',
    },
    cwd,
  );
}

describe('collection interactive shell', () => {
  beforeEach(() => {
    setCliEnv('dev');
    setTty(true);
    vi.mocked(p.select).mockReset();
  });

  it('shows the collection maintenance topology from a collection project', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-collection-shell-'));
    seedCollectionProject(cwd);
    vi.mocked(p.select).mockResolvedValueOnce('exit' as never);

    await runCollectionShell(cwd);

    const options = vi.mocked(p.select).mock.calls[0]?.[0]?.options ?? [];
    expect(options.map((option) => option.value)).toEqual([
      'update',
      'item',
      'version',
      'publish',
      'policy',
      'collect-rules',
      'rss',
      'online',
      'exit',
    ]);
  });
});
