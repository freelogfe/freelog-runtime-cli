import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionItemCommand } from '../../src/commands/collection/item';
import { CliError } from '../../src/core/errors';
import * as items from '../../src/domain/collection/items';

describe('C03.A06 授权状态实际命令输出', () => {
  afterEach(() => vi.restoreAllMocks());
  it('按正式三列输出完整结果，不用itemId代替来源ID', async () => {
    const status = vi.spyOn(items, 'collectionDraftAuthStatus').mockResolvedValue([
      { itemId: 'a', resourceId: 'source_a', isAuth: true }, { itemId: 'b', resourceId: 'source_b', isAuth: false },
    ] as Awaited<ReturnType<typeof items.collectionDraftAuthStatus>>);
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createCollectionItemCommand().parseAsync(['auth', 'status', 'a', 'b', '--resource', 'id:collection_1', '--cwd', process.cwd()], { from: 'user' });
    expect(status).toHaveBeenCalledExactlyOnceWith({ cwd: process.cwd(), selector: 'id:collection_1', itemIds: ['a', 'b'] });
    expect(out).toHaveBeenCalledExactlyOnceWith('a\tsource_a\t已授权\nb\tsource_b\t未授权');
  });

  it('任何整批失败都不打印部分成功，也不把原始响应当诊断', async () => {
    vi.spyOn(items, 'collectionDraftAuthStatus').mockRejectedValue(new CliError('平台单品授权状态响应不完整或无效', 'COLLECTION_ITEM_AUTH_RESPONSE_INVALID'));
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(createCollectionItemCommand().parseAsync(['auth', 'status', 'a', 'b', '--resource', 'id:collection_1'], { from: 'user' }))
      .rejects.toMatchObject({ code: 'COLLECTION_ITEM_AUTH_RESPONSE_INVALID' });
    expect(out).not.toHaveBeenCalled();
  });
});
