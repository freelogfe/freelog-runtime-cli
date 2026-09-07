import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProgram } from '../../src/bin/program';
import { CliError } from '../../src/core/errors';
import { initProject } from '../../src/domain/init/scaffold';
import { readIdentity } from '../../src/local/identity';

describe('init', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-t31-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('init --scaffold none 不登录也能跑，不写 resourceId / env / title', () => {
    const created = initProject({
      cwd,
      scaffold: 'none',
      typeCode: 'VIDEO',
      yes: true,
    });
    expect(created.n).toBe(1);
    expect(created.typeCode).toBe('VIDEO');
    expect(created).not.toHaveProperty('resourceId');
    expect(created).not.toHaveProperty('env');
    expect(created).not.toHaveProperty('title');
    expect(readIdentity(cwd, 1)).toEqual(created);
  });

  it('init theme 写死 RT001 和 dist', () => {
    const created = initProject({
      cwd,
      scaffold: 'runtime',
      shortcut: 'theme',
      template: 'vite-theme',
      yes: true,
    });
    expect(created.typeCode).toBe('RT001');
    expect(created.filePath).toBe('dist');
    expect(created).not.toHaveProperty('resourceId');
  });

  it('init widget 写死 RT002 和 dist', () => {
    const created = initProject({
      cwd,
      scaffold: 'runtime',
      shortcut: 'widget',
      template: 'vite-widget',
      yes: true,
    });
    expect(created.typeCode).toBe('RT002');
    expect(created.filePath).toBe('dist');
  });

  it('init --scaffold collection 失败', () => {
    expect(() =>
      initProject({
        cwd,
        scaffold: 'collection',
        yes: true,
      }),
    ).toThrow(CliError);
    try {
      initProject({ cwd, scaffold: 'collection', yes: true });
    } catch (error) {
      expect((error as CliError).code).toBe('INIT_COLLECTION_UNSUPPORTED');
      expect((error as CliError).message).toBe('合集本期不做');
    }
  });

  it('命令 init --scaffold collection 失败', async () => {
    const program = createProgram();
    program.exitOverride();
    await expect(
      program.parseAsync(
        ['init', '--scaffold', 'collection', '--yes', '--cwd', cwd],
        { from: 'user' },
      ),
    ).rejects.toMatchObject({
      message: '合集本期不做',
    });
  });
});
