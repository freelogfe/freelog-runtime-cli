import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCollectionItemCommand } from '../../src/commands/collection/item';
import { runCli } from '../../src/bin/program';
import * as items from '../../src/domain/collection/items';

describe('C03.R05 添加结果的实际命令出口', () => {
  let cwd: string;
  beforeEach(() => { cwd = mkdtempSync(path.join(tmpdir(), 'freelog-item-add-command-')); });
  afterEach(() => { vi.restoreAllMocks(); rmSync(cwd, { recursive: true, force: true }); });
  const result = { added: ['a'], unchanged: ['b'], failed: [{ resourceId: 'c', reason: '不符合\n\u001b[31m\u202e规则' }] };
  const argv = ['collection', 'item', 'add', 'id:a', 'id:b', 'id:c', '--resource', 'id:collection_1', '--env', 'dev', '--yes'];
  it('完整成功保留旧摘要格式', async () => {
    vi.spyOn(items, 'addCollectionDraftItems').mockResolvedValue({ added: ['a'], unchanged: ['b'], failed: [] } as Awaited<ReturnType<typeof items.addCollectionDraftItems>>);
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createCollectionItemCommand().parseAsync(argv.slice(2), { from: 'user' });
    expect(out).toHaveBeenCalledExactlyOnceWith('已添加：a；未变更：b');
  });
  it('部分失败不打印正常成功行，通过受控错误保留各组', async () => {
    vi.spyOn(items, 'addCollectionDraftItems').mockResolvedValue(result as Awaited<ReturnType<typeof items.addCollectionDraftItems>>);
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(createCollectionItemCommand().parseAsync(argv.slice(2), { from: 'user' })).rejects.toMatchObject({
      code: 'COLLECTION_ITEM_ADD_PARTIAL', message: '已添加：a；未变更：b；失败：c "不符合\\n\\u001b[31m\\u202e规则"',
    });
    expect(out).not.toHaveBeenCalled();
  });
  it('根入口--json返回1且只有一个JSON错误，不混入正常摘要', async () => {
    vi.spyOn(items, 'addCollectionDraftItems').mockResolvedValue(result as Awaited<ReturnType<typeof items.addCollectionDraftItems>>);
    const out = vi.fn(), err = vi.fn(), log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await runCli([...argv, '--cwd', cwd, '--json'], { writeOut: out, writeErr: err })).toBe(1);
    expect(out).toHaveBeenCalledTimes(1); expect(err).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
    const text = out.mock.calls[0][0] as string;
    expect(text.split('\n')).toHaveLength(2);
    expect(JSON.parse(text)).toEqual({ code: 'COLLECTION_ITEM_ADD_PARTIAL', message: '已添加：a；未变更：b；失败：c "不符合\\n\\u001b[31m\\u202e规则"' });
  });
});
