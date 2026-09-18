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
  const ownInfo = async () => ({ data: { resourceId: 'res_listing', userId: 1, status: 4 } });

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
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  it('显式空简介和空标签是清空，不同于未传字段', async () => {
    const update = vi.fn(async () => ({ data: {} }));
    const payload = await updateListing({
      cwd,
      homeDir,
      intro: '',
      tags: '',
      yes: true,
      apis: { info: ownInfo, update },
    });

    expect(payload).toMatchObject({ resourceId: 'res_listing', intro: '', tags: [] });
    expect(payload).not.toHaveProperty('resourceTitle');
    expect(update).toHaveBeenCalledWith(payload);
  });

  it('封面只接受工程内有效图片，并上传后才把 URL 写进 listing 请求', async () => {
    writeFileSync(path.join(cwd, 'cover.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const uploadImage = vi.fn(async ({ file }: { file: Buffer }) => {
      expect(file.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      return { data: { url: 'https://cdn.example/cover.png' } };
    });
    const update = vi.fn(async () => ({ data: {} }));
    const payload = await updateListing({
      cwd,
      homeDir,
      cover: 'cover.png',
      yes: true,
      apis: { info: ownInfo, uploadImage, update },
    });

    expect(payload.coverImages).toEqual(['https://cdn.example/cover.png']);
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(payload);
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
    const update = vi.fn(async () => ({ data: {} }));
    const payload = await updateListing({
      cwd, homeDir, tags: '标签一,#topic', yes: true, apis: { info: ownInfo, update },
    });

    expect(payload.tags).toEqual(['标签一', 'topic']);
    expect(update).toHaveBeenCalledWith(payload);
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
