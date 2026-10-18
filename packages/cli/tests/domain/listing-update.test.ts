import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { updateListing } from '../../src/domain/listing/update';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { createIdentity } from '../../src/local/identity';

describe('listing 更新输入链路', () => {
  let cwd: string;
  let homeDir: string;
  let remote: Record<string, unknown>;
  const ownInfo = async () => ({ data: structuredClone(remote) });
  const save = async (payload: Record<string, unknown>) => { Object.assign(remote, payload); return { data: {} }; };

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-listing-update-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-listing-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({
      cwd,
      homeDir,
      loginName: 'alice',
      password: 'x',
      loginApi: async () => ({ data: { userId: 1, username: 'alice', token: 't' } }),
    });
    createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_listing', resourceName: 'alice/listing', name: 'listing',
      title: '旧标题', typeCode: 'VIDEO', filePath: 'video.mp4', env: 'test',
    });
    remote = { resourceId: 'res_listing', userId: 1, status: 4, resourceName: 'alice/listing', resourceTitle: '旧标题', intro: '旧简介', tags: ['旧标签'], coverImages: [] };
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  it('显式空简介和空标签是清空，不同于未传字段', async () => {
    const update = vi.fn(save);
    const result = await updateListing({
      cwd,
      homeDir,
      intro: '',
      tags: '',
      yes: true,
      apis: { info: ownInfo, update },
    });

    expect(result).toMatchObject({ resourceId: 'res_listing', changed: true, listing: { intro: '', tags: [] } });
    expect(update).toHaveBeenCalledExactlyOnceWith({ resourceId: 'res_listing', intro: '', tags: [] });
  });

  it('封面只接受工程内有效图片，并上传后才把 URL 写进 listing 请求', async () => {
    writeFileSync(path.join(cwd, 'cover.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const uploadImage = vi.fn(async ({ file }: { file: Buffer }) => {
      expect(file.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      return { data: { url: 'https://cdn.example/cover.png' } };
    });
    const update = vi.fn(save);
    const result = await updateListing({
      cwd,
      homeDir,
      cover: 'cover.png',
      yes: true,
      apis: { info: ownInfo, uploadImage, update },
    });

    expect(result.listing.coverImages).toEqual(['https://cdn.example/cover.png']);
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledExactlyOnceWith({ resourceId: 'res_listing', coverImages: ['https://cdn.example/cover.png'] });
  });

  it('空封面、空标签项和不存在图片在上传前拒绝', async () => {
    const update = vi.fn(async () => ({ data: {} }));
    await expect(updateListing({ cwd, homeDir, cover: '', yes: true, apis: { info: ownInfo, update } }))
      .rejects.toMatchObject({ code: 'UPDATE_COVER_REQUIRED' });
    await expect(updateListing({ cwd, homeDir, cover: 'missing.png', yes: true, apis: { info: ownInfo, update } }))
      .rejects.toMatchObject({ code: 'UPDATE_COVER_MISSING' });
    await expect(updateListing({ cwd, homeDir, tags: 'a,,b', yes: true, apis: { info: ownInfo, update } }))
      .rejects.toMatchObject({ code: 'UPDATE_TAG_EMPTY' });
    await expect(updateListing({ cwd, homeDir, tags: '#', yes: true, apis: { info: ownInfo, update } }))
      .rejects.toMatchObject({ code: 'UPDATE_TAG_EMPTY' });
    expect(update).not.toHaveBeenCalled();
  });

  it('标签中的 # 只作展示前缀，提交前会去掉', async () => {
    const update = vi.fn(save);
    const result = await updateListing({
      cwd, homeDir, tags: '标签一,#topic', yes: true, apis: { info: ownInfo, update },
    });

    expect(result.listing.tags).toEqual(['标签一', 'topic']);
    expect(update).toHaveBeenCalledExactlyOnceWith({ resourceId: 'res_listing', tags: ['标签一', 'topic'] });
  });

  it('详情未证明当前账号拥有该资源时，拒绝写 listing', async () => {
    const update = vi.fn(async () => ({ data: {} }));
    await expect(updateListing({
      cwd,
      homeDir,
      title: '不应写入',
      yes: true,
      apis: {
        info: async () => ({ data: { resourceId: 'res_listing', userId: 2, status: 4 } }),
        update,
      },
    })).rejects.toMatchObject({ code: 'RESOURCE_NOT_OWNER' });
    expect(update).not.toHaveBeenCalled();
  });
});
