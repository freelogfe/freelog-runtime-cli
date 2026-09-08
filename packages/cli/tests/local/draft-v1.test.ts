import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/core/errors';
import { draftFilePath, readDraft, writeDraft } from '../../src/local/draft';
import { createIdentity } from '../../src/local/identity';

describe('v1 版本工作稿', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-draft-v1-'));
    createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_1', name: 'clip', typeCode: 'VIDEO',
    });
  });

  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('写入完整 initial v1 稿并固定首版描述和空数组', () => {
    writeDraft(cwd, 1, { fileSha1: 'sha', filename: 'clip.mp4', inputAttrs: [{ key: 'width', value: '1' }] });
    const disk = JSON.parse(readFileSync(draftFilePath(cwd, 1), 'utf8'));
    expect(disk).toMatchObject({
      schemaVersion: 1, draftKind: 'initial', resourceId: 'res_1', resourceTypeCode: 'VIDEO',
      fileSha1: 'sha', filename: 'clip.mp4', analyzedSha1: null, description: '',
      orphanedInputAttrs: [], baseUpcastResources: [], authExcludedItems: [],
    });
    expect(readDraft(cwd, 1)?.draftKind).toBe('initial');
  });

  it('update 稿保留来源版本，分析 SHA 必须对应当前文件', () => {
    writeDraft(cwd, 1, { fromVersion: '1.0.0', fileSha1: 'sha', filename: 'clip.mp4', analyzedSha1: 'sha', description: 'next' });
    expect(readDraft(cwd, 1)).toMatchObject({ draftKind: 'update', fromVersion: '1.0.0', analyzedSha1: 'sha' });
    expect(() => writeDraft(cwd, 1, { fromVersion: '1.0.0', fileSha1: 'sha', filename: 'clip.mp4', analyzedSha1: 'other' })).toThrow(CliError);
  });

  it('旧稿或与身份类型不一致的稿只报错并保留原文件', () => {
    mkdirSync(path.join(cwd, '.freelog'), { recursive: true });
    writeFileSync(draftFilePath(cwd, 1), JSON.stringify({ fromVersion: '1.0.0' }));
    expect(() => readDraft(cwd, 1)).toThrow(expect.objectContaining({ code: 'DRAFT_INVALID' }));
    expect(JSON.parse(readFileSync(draftFilePath(cwd, 1), 'utf8'))).toEqual({ fromVersion: '1.0.0' });
  });

  it('未 create/bind 的身份不能创建工作稿', () => {
    const unboundCwd = mkdtempSync(path.join(tmpdir(), 'freelog-draft-unbound-'));
    try {
      createIdentity(unboundCwd, { subject: 'resource', typeCode: 'VIDEO' });
      expect(() => writeDraft(unboundCwd, 1, {})).toThrow(expect.objectContaining({
        code: 'DRAFT_IDENTITY_UNBOUND',
      }));
    } finally {
      rmSync(unboundCwd, { recursive: true, force: true });
    }
  });
});
