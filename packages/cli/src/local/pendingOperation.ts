/**
 * 版本提交已准备或已经发出、但本进程尚未完成本地收尾的最小恢复记录。
 * 它不是版本历史，也不保存提交体、文件内容或任何秘密；当前仅覆盖版本提交。
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { atomicWriteFile } from '../core/atomicWrite';
import { CliError } from '../core/errors';
import { freelogDir } from './identity';
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

export type PendingVersionSubmit = z.infer<typeof pendingVersionSubmitV2Schema>;
export type PendingOperation = PendingVersionSubmit | (z.infer<typeof pendingVersionSubmitV1Schema> & { state: 'sending' });

/** 工程级最多一条；避免不同远端写的结果互相覆盖。 */
export function pendingOperationFilePath(cwd: string): string {
  return path.join(freelogDir(cwd), '.pending-operation.json');
}

function invalidPending(): never {
  throw new CliError('未决远端操作记录无效，请先备份 .freelog 后处理', 'PENDING_OPERATION_INVALID');
}

/** 只读当前未决记录；损坏记录不猜测、不自动删除。 */
export function readPendingOperation(cwd: string): PendingOperation | undefined {
  const filePath = pendingOperationFilePath(cwd);
  if (!existsSync(filePath)) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return invalidPending();
  }
  const v2 = pendingVersionSubmitV2Schema.safeParse(raw);
  if (v2.success) return v2.data;
  const v1 = pendingVersionSubmitV1Schema.safeParse(raw);
  if (v1.success) {
    // v1 不知道请求是否已经离开本机，只能按最保守的 sending 恢复。
    return { ...v1.data, state: 'sending' };
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
}): PendingVersionSubmit {
  if (readPendingOperation(input.cwd)) {
    throw new CliError('存在结果未知的远端操作；请先 resource recover', 'PENDING_OPERATION_EXISTS');
  }
  const pending: PendingVersionSubmit = {
    schemaVersion: 2,
    operationId: randomUUID(),
    kind: 'version-submit',
    resourceN: input.resourceN,
    resourceId: input.resourceId,
    env: input.env,
    version: input.version,
    fileSha1: input.fileSha1,
    createdAt: new Date().toISOString(),
    state: 'prepared',
  };
  atomicWriteFile(pendingOperationFilePath(input.cwd), `${JSON.stringify(pending, null, 2)}\n`);
  return pending;
}

/** 紧邻 POST 前把 prepared 原子推进到 sending；中断之后必须按未知结果恢复。 */
export function markPendingVersionSubmitSending(cwd: string): PendingVersionSubmit {
  const pending = readPendingOperation(cwd);
  if (!pending || pending.state !== 'prepared') {
    throw new CliError('未决版本提交不处于可发送状态，拒绝调用平台', 'PENDING_OPERATION_STATE_INVALID');
  }
  const sending: PendingVersionSubmit = {
    ...pending,
    schemaVersion: 2,
    state: 'sending',
  };
  atomicWriteFile(pendingOperationFilePath(cwd), `${JSON.stringify(sending, null, 2)}\n`);
  return sending;
}

/** 仅在明确平台拒绝时取消武装；未知结果必须保留。 */
export function clearPendingOperation(cwd: string): boolean {
  const filePath = pendingOperationFilePath(cwd);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
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
