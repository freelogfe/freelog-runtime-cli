import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/core/errors';
import { createIdentity, updateIdentity } from '../../src/local/identity';
import { readIndex, writeIndex } from '../../src/local/indexFile';
import { acquireProjectLock, withProjectLock } from '../../src/local/lock';
import { resolveIdentity } from '../../src/local/resolve';

describe('选份与锁', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-t12-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('一条时 --file 可当上传路径', () => {
    createIdentity(cwd, {
      subject: 'resource',
      resourceId: 'res_only',
      name: 'only',
      typeCode: 'VIDEO',
    });
    const resolved = resolveIdentity(cwd, 'clip.mp4');
    expect(resolved.n).toBe(1);
    expect(resolved.name).toBe('only');
  });

  it('一条可省 --file', () => {
    const created = createIdentity(cwd, {
      subject: 'resource',
      resourceId: 'res_only',
      name: 'only',
      typeCode: 'VIDEO',
      filePath: '09-01.mp4',
    });
    const resolved = resolveIdentity(cwd);
    expect(resolved.n).toBe(created.n);
    expect(resolved.filePath).toBe('09-01.mp4');
    expect(readIndex(cwd)).toEqual({ '09-01.mp4': 1 });
  });

  it('多条不指定 --file 失败', () => {
    createIdentity(cwd, {
      subject: 'resource',
      resourceId: 'res_a',
      name: 'a',
      typeCode: 'VIDEO',
      filePath: '09-01.mp4',
    });
    createIdentity(cwd, {
      subject: 'resource',
      resourceId: 'res_b',
      name: 'b',
      typeCode: 'AUDIO',
      filePath: '09-02.mp4',
    });

    expect(() => resolveIdentity(cwd)).toThrow(CliError);
    try {
      resolveIdentity(cwd);
      expect.fail('应当抛出');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('IDENTITY_FILE_REQUIRED');
      expect((error as CliError).message).toBe('一夹多条必须指定 --file');
    }

    const selected = resolveIdentity(cwd, '09-02.mp4');
    expect(selected.n).toBe(2);
    expect(selected.name).toBe('b');
  });

  it('index 与 N.json 打架听 N.json 并修好', () => {
    createIdentity(cwd, {
      subject: 'resource',
      resourceId: 'res_a',
      name: 'a',
      typeCode: 'VIDEO',
      filePath: 'old.mp4',
    });
    createIdentity(cwd, {
      subject: 'resource',
      resourceId: 'res_b',
      name: 'b',
      typeCode: 'AUDIO',
      filePath: 'other.mp4',
    });
    updateIdentity(cwd, 1, { filePath: '09-01.mp4' });

    writeIndex(cwd, {
      'stale.mp4': 1,
      'other.mp4': 2,
    });
    expect(readIndex(cwd)).toEqual({
      'stale.mp4': 1,
      'other.mp4': 2,
    });

    const selected = resolveIdentity(cwd, '09-01.mp4');
    expect(selected.n).toBe(1);
    expect(selected.filePath).toBe('09-01.mp4');
    expect(readIndex(cwd)).toEqual({
      '09-01.mp4': 1,
      'other.mp4': 2,
    });
  });

  it('锁互斥', () => {
    mkdirSync(path.join(cwd, '.freelog'), { recursive: true });
    const first = acquireProjectLock(cwd);
    expect(() => acquireProjectLock(cwd)).toThrow(CliError);
    try {
      acquireProjectLock(cwd);
      expect.fail('应当抛出');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('PROJECT_LOCKED');
    }
    first.release();

    const result = withProjectLock(cwd, () => 'ok');
    expect(result).toBe('ok');
    const second = acquireProjectLock(cwd);
    second.release();
  });

  it('手写错误 index 在 resolve 后按 N.json 修好', () => {
    createIdentity(cwd, {
      subject: 'resource',
      resourceId: 'res_solo',
      name: 'solo',
      typeCode: 'VIDEO',
      filePath: 'dist',
    });
    writeFileSync(
      path.join(cwd, '.freelog', 'index.json'),
      `${JSON.stringify({ dist: 9 }, null, 2)}\n`,
    );
    resolveIdentity(cwd);
    expect(JSON.parse(readFileSync(path.join(cwd, '.freelog', 'index.json'), 'utf8'))).toEqual({
      dist: 1,
    });
  });
});
