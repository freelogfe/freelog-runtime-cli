import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIdentity, identityFilePath, prepareIdentityUpdate, readIdentity, serializeIdentity } from '../../src/local/identity';
import { acquireProjectLock, withProjectLock } from '../../src/local/lock';
import { transactionFilePath } from '../../src/local/transaction';

function digest(value: string | null): string | null {
  return value === null ? null : createHash('sha256').update(value).digest('hex');
}

describe('S68 本地事务恢复与工程锁', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-txn-'));
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_txn', name: 'txn', title: '原标题', typeCode: 'VIDEO' });
  });

  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('下一次持锁操作会把可校验的未完成事务前滚为完整身份状态', () => {
    const file = identityFilePath(cwd, 1);
    const before = readFileSync(file, 'utf8');
    const next = serializeIdentity(prepareIdentityUpdate(cwd, 1, { title: '恢复后的标题' }));
    writeFileSync(transactionFilePath(cwd), `${JSON.stringify({
      schemaVersion: 1,
      entries: [{ path: file, before, beforeSha256: digest(before), after: next, afterSha256: digest(next) }],
    })}\n`);

    withProjectLock(cwd, () => undefined, 'scenario-recover');

    expect(readIdentity(cwd, 1).title).toBe('恢复后的标题');
    expect(existsSync(transactionFilePath(cwd))).toBe(false);
  });

  it('事务主本与日志不一致时停止并保留日志，不猜测覆盖', () => {
    const file = identityFilePath(cwd, 1);
    const after = serializeIdentity(prepareIdentityUpdate(cwd, 1, { title: '不应覆盖' }));
    const wrongBefore = '{"unexpected":true}\n';
    writeFileSync(transactionFilePath(cwd), `${JSON.stringify({
      schemaVersion: 1,
      entries: [{ path: file, before: wrongBefore, beforeSha256: digest(wrongBefore), after, afterSha256: digest(after) }],
    })}\n`);

    expect(() => withProjectLock(cwd, () => undefined, 'scenario-conflict')).toThrow(expect.objectContaining({ code: 'LOCAL_TXN_CONFLICT' }));
    expect(readIdentity(cwd, 1).title).toBe('原标题');
    expect(existsSync(transactionFilePath(cwd))).toBe(true);
  });

  it('存活写锁阻止另一条操作进入', () => {
    const lock = acquireProjectLock(cwd, 'first-writer');
    try {
      expect(() => withProjectLock(cwd, () => undefined, 'second-writer')).toThrow(expect.objectContaining({ code: 'PROJECT_LOCKED' }));
    } finally {
      lock.release();
    }
  });
});
