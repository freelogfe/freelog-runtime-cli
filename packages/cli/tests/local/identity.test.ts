import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/core/errors';
import { createIdentity, readIdentity } from '../../src/local/identity';

function project(): string { return mkdtempSync(path.join(tmpdir(), 'freelog-single-')); }

describe('单工程身份', () => {
  it('只创建固定的 1.json', () => {
    const cwd = project();
    const first = createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO' });
    expect(first.n).toBe(1);
    expect(readIdentity(cwd, 1).typeCode).toBe('VIDEO');
  });

  it('拒绝在同一工程创建第二份身份', () => {
    const cwd = project();
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO' });
    expect(() => createIdentity(cwd, { subject: 'resource', typeCode: 'AUDIO' }))
      .toThrow(new CliError('一个工程只能管理一个资源；请使用独立工程目录', 'IDENTITY_SINGLE_RESOURCE'));
  });
});
