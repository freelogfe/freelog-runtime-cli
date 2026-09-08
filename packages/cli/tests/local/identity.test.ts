import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/core/errors';
import {
  createIdentity,
  listIdentityNumbers,
  readIdentity,
  updateIdentity,
} from '../../src/local/identity';

function readRaw(cwd: string, n: number): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(cwd, '.freelog', `${n}.json`), 'utf8'),
  ) as Record<string, unknown>;
}

describe('N.json 读写', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-t11-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('立项身份不预写名称；绑定时 resourceId 与 name 一起写入', () => {
    const created = createIdentity(cwd, {
      subject: 'resource',
      typeCode: 'VIDEO',
      filePath: '09-01.mp4',
    });

    expect(created).toEqual({
      n: 1,
      schemaVersion: 1,
      subject: 'resource',
      typeCode: 'VIDEO',
      filePath: '09-01.mp4',
    });
    expect(created).not.toHaveProperty('resourceId');
    expect(created).not.toHaveProperty('env');

    const read = readIdentity(cwd, 1);
    expect(read).toEqual(created);

    const updated = updateIdentity(cwd, 1, {
      resourceId: 'res_abc',
      filePath: '09-01-v2.mp4',
      name: 'demo-res-2',
    });
    expect(updated).toEqual({
      n: 1,
      schemaVersion: 1,
      subject: 'resource',
      resourceId: 'res_abc',
      name: 'demo-res-2',
      typeCode: 'VIDEO',
      filePath: '09-01-v2.mp4',
    });
    expect(readIdentity(cwd, 1)).toEqual(updated);

    const raw = readRaw(cwd, 1);
    expect(Object.keys(raw)).toEqual([
      'schemaVersion',
      'subject',
      'resourceId',
      'name',
      'typeCode',
      'filePath',
    ]);
  });

  it('编号 max+1，删除中间号后不复用', () => {
    const first = createIdentity(cwd, {
      subject: 'resource',
      typeCode: 'VIDEO',
    });
    const second = createIdentity(cwd, {
      subject: 'resource',
      typeCode: 'AUDIO',
    });
    const third = createIdentity(cwd, {
      subject: 'resource',
      typeCode: 'IMAGE',
    });

    expect(first.n).toBe(1);
    expect(second.n).toBe(2);
    expect(third.n).toBe(3);
    expect(listIdentityNumbers(cwd)).toEqual([1, 2, 3]);

    unlinkSync(path.join(cwd, '.freelog', '2.json'));
    expect(listIdentityNumbers(cwd)).toEqual([1, 3]);

    const fourth = createIdentity(cwd, {
      subject: 'resource',
      typeCode: 'VIDEO',
    });
    expect(fourth.n).toBe(4);
    expect(listIdentityNumbers(cwd)).toEqual([1, 3, 4]);
  });

  it('已有 1、3 时下一个是 4 不是 2', () => {
    mkdirSync(path.join(cwd, '.freelog'), { recursive: true });
    writeFileSync(
      path.join(cwd, '.freelog', '1.json'),
      `${JSON.stringify({
        subject: 'resource',
        name: 'one',
        typeCode: 'VIDEO',
      })}\n`,
    );
    writeFileSync(
      path.join(cwd, '.freelog', '3.json'),
      `${JSON.stringify({
        subject: 'resource',
        name: 'three',
        typeCode: 'AUDIO',
      })}\n`,
    );

    const created = createIdentity(cwd, {
      subject: 'resource',
      typeCode: 'IMAGE',
    });
    expect(created.n).toBe(4);
    expect(listIdentityNumbers(cwd)).toEqual([1, 3, 4]);
  });

  it('未绑定身份不能预写 env；绑定后才可写 test/dev', () => {
    const omitted = createIdentity(cwd, {
      subject: 'resource',
      typeCode: 'VIDEO',
    });
    expect(omitted).not.toHaveProperty('env');
    expect(readRaw(cwd, 1)).not.toHaveProperty('env');

    expect(() => createIdentity(cwd, {
      subject: 'resource',
      typeCode: 'AUDIO',
      env: 'test',
    })).toThrow(/未绑定身份不能写入环境/);
  });

  it('绑定身份写入 test/dev，prod 不落盘', () => {
    const testId = createIdentity(cwd, {
      subject: 'resource',
      resourceId: 'res_test',
      name: 'in-test',
      typeCode: 'VIDEO',
      env: 'test',
    });
    expect(testId.env).toBe('test');
    expect(readRaw(cwd, 1).env).toBe('test');
    expect(readIdentity(cwd, 1).env).toBe('test');

    const devId = createIdentity(cwd, {
      subject: 'resource',
      resourceId: 'res_dev',
      name: 'in-dev',
      typeCode: 'AUDIO',
      env: 'dev',
    });
    expect(devId.env).toBe('dev');
    expect(readRaw(cwd, 2).env).toBe('dev');

    const cleared = updateIdentity(cwd, 1, { env: 'prod' });
    expect(cleared).not.toHaveProperty('env');
    expect(readRaw(cwd, 1)).not.toHaveProperty('env');
  });

  it('拒绝只有 resourceId 或只有 name 的身份', () => {
    expect(() => createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_only', typeCode: 'VIDEO',
    })).toThrow(/resourceId 和 name/);
    expect(() => createIdentity(cwd, {
      subject: 'resource', name: 'name-only', typeCode: 'VIDEO',
    })).toThrow(/resourceId 和 name/);
  });

  it('写入 artifactMode / title / latestVersion 必须失败，读回没有这些键', () => {
    expect(() =>
      createIdentity(cwd, {
        subject: 'resource',
        name: 'blocked',
        typeCode: 'VIDEO',
        title: '不能写标题',
        artifactMode: 'zip',
        latestVersion: '1.0.0',
      }),
    ).toThrow(CliError);

    try {
      createIdentity(cwd, {
        subject: 'resource',
        name: 'blocked',
        typeCode: 'VIDEO',
        title: '不能写标题',
        artifactMode: 'zip',
        latestVersion: '1.0.0',
      });
      expect.fail('应当抛出');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('IDENTITY_FORBIDDEN_FIELD');
      expect((error as CliError).message).toContain('title');
      expect((error as CliError).message).toContain('artifactMode');
      expect((error as CliError).message).toContain('latestVersion');
    }

    expect(listIdentityNumbers(cwd)).toEqual([]);

    const created = createIdentity(cwd, {
      subject: 'resource',
      typeCode: 'VIDEO',
    });
    expect(() =>
      updateIdentity(cwd, created.n, {
        title: '还是不能写',
        artifactMode: 'directory',
        latestVersion: '2.0.0',
      }),
    ).toThrow(CliError);

    const raw = readRaw(cwd, 1);
    expect(raw).not.toHaveProperty('title');
    expect(raw).not.toHaveProperty('artifactMode');
    expect(raw).not.toHaveProperty('latestVersion');
    expect(readIdentity(cwd, 1)).toEqual(created);
  });

  it('1.version.json 不参与编号', () => {
    mkdirSync(path.join(cwd, '.freelog'), { recursive: true });
    writeFileSync(
      path.join(cwd, '.freelog', '1.version.json'),
      `${JSON.stringify({ description: '不是身份' })}\n`,
    );

    const created = createIdentity(cwd, {
      subject: 'resource',
      typeCode: 'VIDEO',
    });
    expect(created.n).toBe(1);
    expect(listIdentityNumbers(cwd)).toEqual([1]);
  });
});
