import { mkdtempSync, writeFileSync } from 'node:fs';
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

  it('按文件名选择多身份目录中的资源', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-resolve-'));
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'video.mp4' });
    createIdentity(cwd, { subject: 'resource', typeCode: 'AUDIO', filePath: 'audio.mp3' });
    expect(resolveIdentity(cwd, 'file:2.json').n).toBe(2);
    expect(() => resolveIdentity(cwd)).toThrow(/多份资源状态/);
  });

  it('拒绝手工复制形成的重复资源 ID', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-resolve-'));
    createIdentity(cwd, { subject: 'resource', resourceId: 'r1', name: 'a', title: 'A', typeCode: 'VIDEO', filePath: 'a.mp4' });
    createIdentity(cwd, { subject: 'resource', resourceId: 'r2', name: 'b', title: 'B', typeCode: 'VIDEO', filePath: 'b.mp4' });
    writeFileSync(path.join(cwd, '.freelog', '2.json'), JSON.stringify({
      schemaVersion: 1, subject: 'resource', resourceId: 'r1', name: 'b', title: 'B', typeCode: 'VIDEO', filePath: 'b.mp4',
    }));
    expect(() => resolveIdentity(cwd, 'file:1.json')).toThrow(/本地状态冲突/);
  });

  it('拒绝手工改写后以非规范路径绕过的重复产物', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-resolve-'));
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'video.mp4' });
    createIdentity(cwd, { subject: 'resource', typeCode: 'IMAGE', filePath: 'cover.jpg' });
    writeFileSync(path.join(cwd, '.freelog', '2.json'), JSON.stringify({
      schemaVersion: 1, subject: 'resource', typeCode: 'IMAGE', filePath: './video.mp4',
    }));
    expect(() => resolveIdentity(cwd, 'file:1.json')).toThrow(/本地状态冲突/);
  });

  it('任一资源命令都会先拒绝孤儿工作稿或错配工作稿', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-resolve-'));
    createIdentity(cwd, { subject: 'resource', resourceId: 'r1', name: 'a', title: 'A', typeCode: 'VIDEO', filePath: 'a.mp4' });
    writeFileSync(path.join(cwd, '.freelog', '2.version.json'), JSON.stringify({ schemaVersion: 1 }));
    expect(() => resolveIdentity(cwd, 'file:1.json')).toThrow(/没有同号身份文件/);
  });
});
