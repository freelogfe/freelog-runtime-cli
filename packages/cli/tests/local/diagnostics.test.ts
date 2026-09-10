import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { diagnoseLocalState } from '../../src/local/diagnostics';
import { createIdentity } from '../../src/local/identity';
import { resolveIdentity } from '../../src/local/resolve';

describe('本地状态诊断', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-diagnostics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('损坏身份和孤儿工作稿不会让诊断命令失去可读性', () => {
    createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_valid', resourceName: 'alice/valid', name: 'valid',
      typeCode: 'VIDEO', filePath: 'valid.mp4', env: 'test',
    });
    const stateDir = path.join(cwd, '.freelog');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(path.join(stateDir, '2.json'), '{');
    writeFileSync(path.join(stateDir, '3.version.json'), '{}');

    const report = diagnoseLocalState(cwd);
    expect(report).toContain('1.json：有效');
    expect(report).toContain('2.json [IDENTITY_INVALID]');
    expect(report).toContain('3.version.json [DRAFT_ORPHAN]');
    expect(() => resolveIdentity(cwd)).toThrow(/无法解析/);
  });

  it('遗留 index.json 不参与选择，也不因内容损坏阻断正常资源', () => {
    createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_legacy', resourceName: 'alice/legacy', name: 'legacy',
      typeCode: 'VIDEO', filePath: 'legacy.mp4', env: 'test',
    });
    writeFileSync(path.join(cwd, '.freelog', 'index.json'), '{不再读取的旧文件');

    expect(resolveIdentity(cwd).resourceId).toBe('res_legacy');
    expect(diagnoseLocalState(cwd)).toContain('index.json：历史遗留文件');
  });
});
