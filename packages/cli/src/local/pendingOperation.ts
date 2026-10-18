/**
 * 版本提交已准备或已经发出、但本进程尚未完成本地收尾的最小恢复记录。
 * 它不是版本历史，也不保存提交体、文件内容或任何秘密；当前仅覆盖版本提交。
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { atomicWriteFile } from '../core/atomicWrite';
import { CliError } from '../core/errors';
import { freelogDir } from './identity';
import { commitLocalTransaction } from './transaction';
import type { FreelogEnv } from './types';

const pendingVersionSubmitV1Schema = z.object({
  schemaVersion: z.literal(1),
  operationId: z.string().uuid(),
  kind: z.literal('version-submit'),
  resourceN: z.number().int().positive(),
  resourceId: z.string().min(1),
  env: z.enum(['prod', 'test', 'dev']),
  version: z.string().min(1),
  fileSha1: z.string().min(1),
  createdAt: z.string().min(1),
}).strict();

const pendingVersionSubmitV2Schema = pendingVersionSubmitV1Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(2),
  state: z.enum(['prepared', 'sending']),
}).strict();

const pendingVersionSubmitV3Schema = pendingVersionSubmitV2Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(3),
  draftSha256: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

export type PendingVersionSubmit = z.infer<typeof pendingVersionSubmitV3Schema>;
export type PendingOperation = PendingVersionSubmit | z.infer<typeof pendingVersionSubmitV2Schema>
  | (z.infer<typeof pendingVersionSubmitV1Schema> & { state: 'sending' });
type PendingSubmitSnapshot = { pending: PendingVersionSubmit; sha256: string };

/** 工程级最多一条；避免不同远端写的结果互相覆盖。 */
export function pendingOperationFilePath(cwd: string): string {
  return path.join(freelogDir(cwd), '.pending-operation.json');
}

function invalidPending(): never {
  throw new CliError('未决远端操作记录无效，请先备份 .freelog 后处理', 'PENDING_OPERATION_INVALID');
}

/** 只读当前未决记录；损坏记录不猜测、不自动删除。 */
export function readPendingOperation(cwd: string): PendingOperation | undefined {
  return readPendingOperationSnapshot(cwd)?.pending;
}

/** 恢复持有查询前的记录摘要，不能在最后收尾时清掉外部替换的新记录。 */
export function readPendingOperationSnapshot(cwd: string): { pending: PendingOperation; sha256: string } | undefined {
  const filePath = pendingOperationFilePath(cwd);
  if (!existsSync(filePath)) return undefined;
  let raw: unknown;
  let bytes: Buffer;
  try {
    bytes = readFileSync(filePath);
    raw = JSON.parse(bytes.toString('utf8'));
  } catch {
    return invalidPending();
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const v3 = pendingVersionSubmitV3Schema.safeParse(raw);
  if (v3.success) return { pending: v3.data, sha256 };
  const v2 = pendingVersionSubmitV2Schema.safeParse(raw);
  if (v2.success) return { pending: v2.data, sha256 };
  const v1 = pendingVersionSubmitV1Schema.safeParse(raw);
  if (v1.success) {
    // v1 不知道请求是否已经离开本机，只能按最保守的 sending 恢复。
    return { pending: { ...v1.data, state: 'sending' }, sha256 };
  }
  return invalidPending();
}

/** POST 前先记 prepared；已有一条记录时必须先 recover，不能覆盖未知事实。 */
export function createPendingVersionSubmit(input: {
  cwd: string;
  resourceN: number;
  resourceId: string;
  env: FreelogEnv;
  version: string;
  fileSha1: string;
  draftSha256: string;
}): PendingSubmitSnapshot {
  if (readPendingOperation(input.cwd)) {
    throw new CliError('存在结果未知的远端操作；请先 resource recover', 'PENDING_OPERATION_EXISTS');
  }
  const pending: PendingVersionSubmit = {
    schemaVersion: 3,
    operationId: randomUUID(),
    kind: 'version-submit',
    resourceN: input.resourceN,
    resourceId: input.resourceId,
    env: input.env,
    version: input.version,
    fileSha1: input.fileSha1,
    draftSha256: input.draftSha256,
    createdAt: new Date().toISOString(),
    state: 'prepared',
  };
  if (!pendingVersionSubmitV3Schema.safeParse(pending).success) return invalidPending();
  const content = `${JSON.stringify(pending, null, 2)}\n`;
  atomicWriteFile(pendingOperationFilePath(input.cwd), content);
  return { pending, sha256: createHash('sha256').update(content).digest('hex') };
}

/** 只允许本次创建的prepared推进；重新读到另一条合法记录也不能发送旧payload。 */
export function markPendingVersionSubmitSending(cwd: string, expectedSha256: string): PendingSubmitSnapshot {
  const current = readPendingOperationSnapshot(cwd);
  if (!current || current.sha256 !== expectedSha256) {
    throw new CliError('未决记录在发送前已变化，拒绝调用平台', 'LOCAL_TXN_CONFLICT');
  }
  const pending = current.pending;
  if (pending.schemaVersion !== 3 || pending.state !== 'prepared') {
    throw new CliError('未决版本提交不处于可发送状态，拒绝调用平台', 'PENDING_OPERATION_STATE_INVALID');
  }
  const sending = {
    ...pending,
    state: 'sending' as const,
  };
  const content = `${JSON.stringify(sending, null, 2)}\n`;
  commitLocalTransaction(cwd, [{ path: pendingOperationFilePath(cwd), content, expectedBeforeSha256: expectedSha256 }]);
  const sha256 = createHash('sha256').update(content).digest('hex');
  if (readPendingOperationSnapshot(cwd)?.sha256 !== sha256) {
    throw new CliError('未决记录在发送前已变化，拒绝调用平台', 'LOCAL_TXN_CONFLICT');
  }
  return { pending: sending, sha256 };
}

/** 新业务写的共同前置条件；只读和 recover 不调用它。 */
export function assertNoPendingOperation(cwd: string): void {
  const pending = readPendingOperation(cwd);
  if (pending) {
    throw new CliError(
      `存在未完成收尾的版本提交（${pending.resourceId} ${pending.version}，${pending.state}）；请先 resource recover`,
      'PENDING_OPERATION_EXISTS',
    );
  }
}
