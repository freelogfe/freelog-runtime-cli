import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/bin/program';
import * as showDomain from '../../src/domain/version/show';
import { createIdentity } from '../../src/local/identity';
import { writeDraft } from '../../src/local/draft';

describe('T5.2 show --local 与 discard', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-t52-'));
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_clip', name: 'clip', typeCode: 'VIDEO' });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('version show --local 不打版本接口', async () => {
    writeDraft(cwd, 1, {
      fileSha1: 'abc12345',
      filename: 'a.mp4',
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    const showOnline = vi.spyOn(showDomain, 'showOnline');
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });

    const code = await runCli(
      ['version', 'show', '--local', '--cwd', cwd, '--env', 'test'],
    );

    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('这是本地未提交的版本工作稿');
    expect(logs.join('\n')).toContain('abc12345');
    expect(showOnline).toHaveBeenCalledTimes(0);
  });

  it('version draft discard 没稿退出 0', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    const code = await runCli(
      ['version', 'draft', 'discard', '--cwd', cwd, '--env', 'test'],
    );
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('没有工作稿');
  });

  it('多资源的非交互现有资源命令在调用领域层前要求 --resource', async () => {
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_second', name: 'second', typeCode: 'VIDEO' });
    let stderr = '';
    const code = await runCli(
      ['status', '--yes', '--cwd', cwd, '--env', 'test'],
      { writeErr: (text) => { stderr += text; } },
    );
    expect(code).toBe(1);
    expect(stderr).toContain('非交互调用请使用 --resource 指定资源');
  });

  it('孤儿工作稿在任何资源命令调用平台前停止', async () => {
    writeFileSync(path.join(cwd, '.freelog', '2.version.json'), JSON.stringify({ schemaVersion: 1 }));
    let stderr = '';
    const code = await runCli(
      ['status', '--cwd', cwd, '--env', 'test'],
      { writeErr: (text) => { stderr += text; } },
    );
    expect(code).toBe(1);
    expect(stderr).toContain('没有同号身份文件');
  });
});
