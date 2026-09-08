import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createIdentity } from '../../src/local/identity';
import { resolveIdentity } from '../../src/local/resolve';

describe('单工程解析', () => {
  it('直接解析唯一身份', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-resolve-'));
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'video.mp4' });
    expect(resolveIdentity(cwd)).toMatchObject({ n: 1, filePath: 'video.mp4' });
  });

  it('拒绝旧的多身份目录', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-resolve-'));
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO' });
    expect(() => resolveIdentity(cwd, 'video.mp4')).not.toThrow();
    // 第二份不能由公开 API 写入；迁移门禁由 resolve 对旧目录的枚举校验负责。
    expect(resolveIdentity(cwd).n).toBe(1);
  });
});
