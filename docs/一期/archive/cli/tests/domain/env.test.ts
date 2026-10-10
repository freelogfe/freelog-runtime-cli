import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/core/errors';
import {
  applyCliEnv,
  assertPlatformAllowed,
  getEnv,
  resetEnvForTests,
  resolveEnv,
} from '../../src/domain/env';
import { resolveBoundIdentity } from '../../src/domain/version/gates';
import { createIdentity } from '../../src/local/identity';

const originalFreelogEnv = process.env.FREELOG_ENV;

afterEach(() => {
  if (originalFreelogEnv === undefined) {
    delete process.env.FREELOG_ENV;
  } else {
    process.env.FREELOG_ENV = originalFreelogEnv;
  }
  resetEnvForTests();
});

describe('环境解析', () => {
  it('省略 / --env prod / FREELOG_ENV=prod 算定 prod，打平台失败', () => {
    expect(resolveEnv({})).toBe('prod');
    expect(resolveEnv({ flag: 'prod' })).toBe('prod');
    expect(resolveEnv({ flag: 'production' })).toBe('prod');
    expect(resolveEnv({ env: { FREELOG_ENV: 'prod' } })).toBe('prod');
    expect(resolveEnv({ env: { FREELOG_ENV: '' } })).toBe('prod');

    applyCliEnv({});
    expect(getEnv()).toBe('prod');
    expect(() => assertPlatformAllowed()).toThrow(CliError);
    try {
      assertPlatformAllowed();
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).message).toBe(
        'prod 暂未开放，请用 --env test 或 --env dev',
      );
      expect((error as CliError).code).toBe('PRODUCTION_ENV_DISABLED');
    }

    applyCliEnv({ flag: 'prod' });
    expect(() => assertPlatformAllowed()).toThrow(/prod 暂未开放/);

    process.env.FREELOG_ENV = 'prod';
    applyCliEnv({});
    expect(getEnv()).toBe('prod');
    expect(() => assertPlatformAllowed()).toThrow(/prod 暂未开放/);
  });

  it('--env test / dev 过，getEnv 只返回三个字', () => {
    applyCliEnv({ flag: 'test' });
    expect(getEnv()).toBe('test');
    expect(assertPlatformAllowed()).toBe('test');

    applyCliEnv({ flag: 'dev' });
    expect(getEnv()).toBe('dev');
    expect(assertPlatformAllowed()).toBe('dev');

    applyCliEnv({ flag: 'development' });
    expect(getEnv()).toBe('dev');

    process.env.FREELOG_ENV = 'test';
    applyCliEnv({});
    expect(getEnv()).toBe('test');

    const values = ['prod', 'test', 'dev'] as const;
    applyCliEnv({ flag: 'production' });
    expect(values.includes(getEnv())).toBe(true);
    applyCliEnv({ flag: 'test' });
    expect(values.includes(getEnv())).toBe(true);
    applyCliEnv({ flag: 'development' });
    expect(values.includes(getEnv())).toBe(true);
  });

  it('--env 优先于 FREELOG_ENV，其它字失败', () => {
    process.env.FREELOG_ENV = 'dev';
    expect(resolveEnv({ flag: 'test' })).toBe('test');

    expect(() => resolveEnv({ flag: 'staging' })).toThrow(CliError);
    try {
      resolveEnv({ flag: 'local' });
    } catch (error) {
      expect((error as CliError).message).toBe('环境只能是 prod、test 或 dev');
      expect((error as CliError).code).toBe('ENV_INVALID');
    }
  });

  it('已绑定资源状态只能在其创建或 bind 的环境使用', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-env-resource-'));
    try {
      createIdentity(cwd, {
        subject: 'resource', resourceId: 'res_dev', resourceName: 'alice/dev-resource', name: 'dev-resource',
        typeCode: 'VIDEO', filePath: 'video.mp4', env: 'dev',
      });
      applyCliEnv({ flag: 'test' });
      expect(() => resolveBoundIdentity(cwd)).toThrow(CliError);
      try {
        resolveBoundIdentity(cwd);
      } catch (error) {
        expect((error as CliError).code).toBe('RESOURCE_ENV_MISMATCH');
      }
      applyCliEnv({ flag: 'dev' });
      expect(resolveBoundIdentity(cwd)).toMatchObject({ resourceId: 'res_dev' });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
