import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCollectionItemCommand } from '../../src/commands/collection/item';
import * as items from '../../src/domain/collection/items';
import * as tty from '../../src/core/tty';
import { runCli } from '../../src/bin/program';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
describe('C03.P01 可选来源的命令分流', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([false, true])('JSON缺来源即使TTY=%s且yes仍零请求拒绝', async (interactive) => {
    vi.spyOn(tty, 'isInteractive').mockReturnValue(interactive);
    const add = vi.spyOn(items, 'addCollectionDraftItems');
    await expect(createCollectionItemCommand().parseAsync(['add', '--env', 'dev', '--json', '--yes'], { from: 'user' }))
      .rejects.toMatchObject({ code: 'COLLECTION_ITEM_SOURCE_REQUIRED' }); expect(add).not.toHaveBeenCalled();
  });
  it('非TTY缺来源是业务错误，不是Commander缺参或原生凭据请求', async () => {
    vi.spyOn(tty, 'isInteractive').mockReturnValue(false); const add = vi.spyOn(items, 'addCollectionDraftItems');
    await expect(createCollectionItemCommand().parseAsync(['add', '--env', 'dev', '--yes'], { from: 'user' }))
      .rejects.toMatchObject({ code: 'COLLECTION_ITEM_SOURCE_REQUIRED' }); expect(add).not.toHaveBeenCalled();
  });
  it('选择后用精确目标ID与来源重新进入原add，不复用模糊selector', async () => {
    const selected = vi.spyOn(items, 'selectCollectionItemSources').mockResolvedValue({ resourceId: 'exact_target', sources: ['id:r1', 'id:r2'] });
    const add = vi.spyOn(items, 'addCollectionDraftItems').mockResolvedValue({ added: ['r1', 'r2'], unchanged: [], failed: [] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await createCollectionItemCommand().parseAsync(['add', '--resource', 'name:alice/collection', '--env', 'dev', '--yes'], { from: 'user' });
    expect(selected).toHaveBeenCalledTimes(1); expect(add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ selector: 'id:exact_target', sources: ['id:r1', 'id:r2'], yes: true }));
  });
  it('显式来源完全绕过选择器，旧写前门禁照常负责', async () => {
    const selected = vi.spyOn(items, 'selectCollectionItemSources');
    const add = vi.spyOn(items, 'addCollectionDraftItems').mockResolvedValue({ added: ['r1'], unchanged: [], failed: [] }); vi.spyOn(console, 'log').mockImplementation(() => {});
    await createCollectionItemCommand().parseAsync(['add', 'id:r1', '--resource', 'id:c1', '--json', '--yes'], { from: 'user' });
    expect(selected).not.toHaveBeenCalled(); expect(add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ selector: 'id:c1', sources: ['id:r1'] }));
  });
  it('选择取消不调用add，不打印成功摘要', async () => {
    vi.spyOn(items, 'selectCollectionItemSources').mockRejectedValue(Object.assign(new Error('已取消单品选择'), { code: 'COLLECTION_ITEM_SELECTION_CANCELLED' }));
    const add = vi.spyOn(items, 'addCollectionDraftItems'), out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(createCollectionItemCommand().parseAsync(['add'], { from: 'user' })).rejects.toMatchObject({ code: 'COLLECTION_ITEM_SELECTION_CANCELLED' });
    expect(add).not.toHaveBeenCalled(); expect(out).not.toHaveBeenCalled();
  });
  it.each([[true, true], [false, true], [false, false]])('完整根入口TTY=%s/JSON=%s缺来源在事务前拒绝，序号/txn/二进制原字节保留', async (interactive, json) => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-item-picker-entry-'));
    const hash = (s: string) => createHash('sha256').update(s).digest('hex');
    mkdirSync(path.join(cwd, '.freelog'));
    writeFileSync(path.join(cwd, '.freelog/.sequence'), '1\n');
    writeFileSync(path.join(cwd, '.freelog/.txn.json'), JSON.stringify({ schemaVersion: 1, entries: [{ path: '.sequence', before: '1\n', beforeSha256: hash('1\n'), after: '2\n', afterSha256: hash('2\n') }] }));
    writeFileSync(path.join(cwd, '.freelog/keep.bin'), Buffer.from([0,255,254]));
    const snapshot = () => readdirSync(path.join(cwd, '.freelog')).sort().map((n) => [n, readFileSync(path.join(cwd, '.freelog', n)).toString('base64')]);
    const before = snapshot(), out = vi.fn(), err = vi.fn(); vi.spyOn(tty, 'isInteractive').mockReturnValue(interactive);
    try {
      expect(await runCli(['collection','item','add','--env','dev',...(json ? ['--json'] : []),'--yes','--cwd',cwd], { writeOut: out, writeErr: err })).toBe(1);
      if (json) { expect(JSON.parse(out.mock.calls[0][0] as string)).toMatchObject({ code: 'COLLECTION_ITEM_SOURCE_REQUIRED' }); expect(err).not.toHaveBeenCalled(); }
      else { expect(out).not.toHaveBeenCalled(); expect(err.mock.calls[0][0]).toContain('非交互或JSON调用请明确提供来源'); }
      expect(snapshot()).toEqual(before);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
