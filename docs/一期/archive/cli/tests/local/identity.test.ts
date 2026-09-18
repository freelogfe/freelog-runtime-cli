import { mkdtempSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createIdentity, identityFilePath, identitySequenceFilePath, readIdentity } from '../../src/local/identity';

function project(): string { return mkdtempSync(path.join(tmpdir(), 'freelog-single-')); }

describe('单工程身份', () => {
  it('只创建固定的 1.json', () => {
    const cwd = project();
    const first = createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'video.mp4' });
    expect(first.n).toBe(1);
    expect(readIdentity(cwd, 1).typeCode).toBe('VIDEO');
  });

  it('在同一工程分配递增身份编号', () => {
    const cwd = project();
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'video.mp4' });
    expect(createIdentity(cwd, { subject: 'resource', typeCode: 'AUDIO', filePath: 'audio.mp3' }).n).toBe(2);
  });

  it('删除身份文件后仍不复用已分配编号', () => {
    const cwd = project();
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'video.mp4' });
    unlinkSync(identityFilePath(cwd, 1));
    const next = createIdentity(cwd, { subject: 'resource', typeCode: 'AUDIO', filePath: 'audio.mp3' });
    expect(next.n).toBe(2);
    expect(readFileSync(identitySequenceFilePath(cwd), 'utf8')).toBe('2\n');
  });
});
