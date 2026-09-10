/**
 * N.json：只存单资源身份与立项最小信息。身份文件必须是 schemaVersion=1；
 * 未绑定立项禁止预写 name/resourceId/env，绑定后三者按不变量一起出现。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z, ZodIssueCode } from 'zod';
import { atomicWriteFile } from '../core/atomicWrite';
import { CliError } from '../core/errors';
import { withProjectLock } from './lock';
import { commitLocalTransaction } from './transaction';
import type {
  IdentityRecord,
  IdentityWriteInput,
  ResourceIdentity,
} from './types';

const IDENTITY_FILE_RE = /^([1-9]\d*)\.json$/;

const inputFields = {
  subject: z.literal('resource'),
  resourceId: z.string().min(1).optional(),
  resourceName: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  typeCode: z.string().min(1),
  filePath: z.string().min(1),
  env: z.enum(['prod', 'test', 'dev']).optional(),
};

const createSchema = z.object(inputFields).strict();
const patchSchema = z.object(inputFields).partial().strict();
const storedSchema = z.object({
  schemaVersion: z.literal(1),
  ...inputFields,
}).strict().superRefine((identity, ctx) => {
  const hasResourceId = identity.resourceId !== undefined;
  const hasResourceName = identity.resourceName !== undefined;
  const hasName = identity.name !== undefined;
  const hasTitle = identity.title !== undefined;
  const bound = hasResourceId || hasResourceName || hasName || hasTitle;
  if (hasResourceId !== hasName) {
    ctx.addIssue({
      code: ZodIssueCode.custom,
      path: hasResourceId ? ['name'] : ['resourceId'],
      message: '绑定身份必须同时包含 resourceId 和 name',
    });
  }
  if (hasResourceName && (!hasResourceId || !hasName)) {
    ctx.addIssue({ code: ZodIssueCode.custom, path: ['resourceName'], message: '完整资源标识只能属于已绑定身份' });
  }
  if (!hasResourceId && !hasName && (hasTitle || hasResourceName)) {
    ctx.addIssue({ code: ZodIssueCode.custom, path: [hasTitle ? 'title' : 'resourceName'], message: '未绑定身份不能写入绑定缓存' });
  }
  if (!bound && identity.env !== undefined) {
    ctx.addIssue({
      code: ZodIssueCode.custom,
      path: ['env'],
      message: '未绑定身份不能写入环境',
    });
  }
});

/** .freelog 目录路径。 */
export function freelogDir(cwd: string): string {
  return path.join(path.resolve(cwd), '.freelog');
}

/** 返回指定编号的身份主本路径。 */
export function identityFilePath(cwd: string, n: number): string {
  return path.join(freelogDir(cwd), `${n}.json`);
}

/** 持久化已分配的最大 N；身份文件被用户删除后也不复用该编号。 */
export function identitySequenceFilePath(cwd: string): string {
  return path.join(freelogDir(cwd), '.sequence');
}

function assertIdentityNumber(n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new CliError('身份编号无效', 'IDENTITY_INVALID');
  }
}

function throwZodAsCliError(error: z.ZodError): never {
  const unrecognized = error.issues.find((issue) => issue.code === ZodIssueCode.unrecognized_keys);
  if (unrecognized && unrecognized.code === ZodIssueCode.unrecognized_keys) {
    throw new CliError(`N.json 不能写入 ${unrecognized.keys.join('、')}`, 'IDENTITY_FORBIDDEN_FIELD');
  }
  const field = error.issues[0]?.path[0];
  if (field === 'env') {
    if (error.issues[0]?.message === '未绑定身份不能写入环境') {
      throw new CliError('未绑定身份不能写入环境', 'IDENTITY_ENV_INVALID');
    }
    throw new CliError('环境只能是 prod、test 或 dev', 'IDENTITY_ENV_INVALID');
  }
  if (field === 'subject') {
    throw new CliError('本期只支持单资源', 'IDENTITY_SUBJECT_UNSUPPORTED');
  }
  if (field === 'name' || field === 'resourceName' || field === 'resourceId' || field === 'title') {
    throw new CliError('绑定身份字段不完整', 'IDENTITY_BINDING_INVALID');
  }
  if (field === 'filePath') {
    throw new CliError('每份资源状态必须关联本地产物路径', 'IDENTITY_ARTIFACT_REQUIRED');
  }
  throw new CliError('身份字段无效', 'IDENTITY_INVALID');
}

function toStored(data: z.infer<typeof storedSchema>): ResourceIdentity {
  return {
    schemaVersion: 1,
    subject: data.subject,
    ...(data.resourceId ? { resourceId: data.resourceId } : {}),
    ...(data.resourceName ? { resourceName: data.resourceName } : {}),
    ...(data.name ? { name: data.name } : {}),
    ...(data.title ? { title: data.title } : {}),
    typeCode: data.typeCode,
    filePath: data.filePath,
    ...(data.env === 'test' || data.env === 'dev' ? { env: data.env } : {}),
  };
}

function normalize(input: IdentityWriteInput): ResourceIdentity {
  const parsed = storedSchema.safeParse({ schemaVersion: 1, ...input });
  if (!parsed.success) {
    throwZodAsCliError(parsed.error);
  }
  return toStored(parsed.data);
}

function toDiskObject(identity: ResourceIdentity): Record<string, unknown> {
  return {
    schemaVersion: 1,
    subject: identity.subject,
    ...(identity.resourceId ? { resourceId: identity.resourceId } : {}),
    ...(identity.resourceName ? { resourceName: identity.resourceName } : {}),
    ...(identity.name ? { name: identity.name } : {}),
    ...(identity.title ? { title: identity.title } : {}),
    typeCode: identity.typeCode,
    filePath: identity.filePath,
    ...(identity.env ? { env: identity.env } : {}),
  };
}

/** 身份文件的唯一序列化形式，供跨主本事务生成目标内容。 */
export function serializeIdentity(identity: ResourceIdentity): string {
  return `${JSON.stringify(toDiskObject(identity), null, 2)}\n`;
}

function writeIdentityFile(cwd: string, n: number, identity: ResourceIdentity): void {
  atomicWriteFile(identityFilePath(cwd, n), serializeIdentity(identity));
}

function parseCreateInput(input: IdentityWriteInput): ResourceIdentity {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    throwZodAsCliError(parsed.error);
  }
  return normalize(parsed.data);
}

/** 在不写盘的情况下验证并计算新身份，供同一事务内同时改身份与工作稿的调用方使用。 */
export function prepareIdentityUpdate(
  cwd: string,
  n: number,
  patch: Partial<IdentityWriteInput> & Record<string, unknown>,
): IdentityRecord {
  const current = readIdentity(cwd, n);
  const parsed = parsePatchInput(patch);
  const identity = normalize({
    subject: parsed.subject ?? current.subject,
    resourceId: parsed.resourceId ?? current.resourceId,
    resourceName: parsed.resourceName ?? current.resourceName,
    name: parsed.name ?? current.name,
    title: parsed.title ?? current.title,
    typeCode: parsed.typeCode ?? current.typeCode,
    filePath: parsed.filePath ?? current.filePath,
    env: parsed.env ?? current.env,
  });
  return { n, ...identity };
}

/** 在不写盘的情况下验证并分配下一个身份编号。调用方须已持有项目锁。 */
export function prepareIdentityCreate(
  cwd: string,
  input: IdentityWriteInput & Record<string, unknown>,
): IdentityRecord {
  const numbers = listIdentityNumbers(cwd);
  const highestOnDisk = numbers.length === 0 ? 0 : Math.max(...numbers);
  const sequencePath = identitySequenceFilePath(cwd);
  let highestAllocated = 0;
  if (existsSync(sequencePath)) {
    const raw = readFileSync(sequencePath, 'utf8').trim();
    const parsed = Number(raw);
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(parsed)) {
      throw new CliError('.freelog/.sequence 无效，请先备份后恢复', 'IDENTITY_SEQUENCE_INVALID');
    }
    highestAllocated = parsed;
  }
  return { n: Math.max(highestOnDisk, highestAllocated) + 1, ...parseCreateInput(input) };
}

/** 为新 N 准备与身份主本同事务提交的编号游标内容。 */
export function serializeIdentitySequence(n: number): string {
  assertIdentityNumber(n);
  return `${n}\n`;
}

function parsePatchInput(input: Partial<IdentityWriteInput>): Partial<IdentityWriteInput> {
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) {
    throwZodAsCliError(parsed.error);
  }
  return parsed.data;
}

function parseStoredIdentity(raw: unknown, n: number): ResourceIdentity {
  const parsed = storedSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError(
      `身份文件 ${n}.json 无效；本期只支持 schemaVersion=1，请重新 init 或 bind`,
      'IDENTITY_INVALID',
    );
  }
  return toStored(parsed.data);
}

/** 仅枚举身份编号；工作稿等同编号附属文件不参与编号。 */
export function listIdentityNumbers(cwd: string): number[] {
  const dir = freelogDir(cwd);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .map((name) => IDENTITY_FILE_RE.exec(name))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

/** 读取并严格校验一份身份主本。 */
export function readIdentity(cwd: string, n: number): IdentityRecord {
  assertIdentityNumber(n);
  const filePath = identityFilePath(cwd, n);
  if (!existsSync(filePath)) {
    throw new CliError(`找不到身份文件 ${n}.json`, 'IDENTITY_NOT_FOUND');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    throw new CliError(`身份文件 ${n}.json 无法解析`, 'IDENTITY_INVALID');
  }
  return { n, ...parseStoredIdentity(raw, n) };
}

/** 按编号升序读取工程里的全部单资源身份。 */
export function listIdentities(cwd: string): IdentityRecord[] {
  return listIdentityNumbers(cwd).map((n) => readIdentity(cwd, n));
}

/** 新建身份；编号由持久化序列分配，删除旧身份文件也不复用。 */
export function createIdentity(
  cwd: string,
  input: IdentityWriteInput & Record<string, unknown>,
): IdentityRecord {
  return withProjectLock(cwd, () => {
    const identity = prepareIdentityCreate(cwd, input);
    // N.json 与单调游标必须一起前滚。中断后由事务恢复，不能留下“文件已创建、
    // 游标未推进”而在用户手动移除文件后复用编号的窗口。
    commitLocalTransaction(cwd, [
      { path: identityFilePath(cwd, identity.n), content: serializeIdentity(identity) },
      { path: identitySequenceFilePath(cwd), content: serializeIdentitySequence(identity.n) },
    ]);
    return identity;
  }, 'create-identity');
}

/** 修改后重新验证整体不变量，不能以局部 patch 绕过未绑定/绑定边界。 */
export function updateIdentity(
  cwd: string,
  n: number,
  patch: Partial<IdentityWriteInput> & Record<string, unknown>,
): IdentityRecord {
  return withProjectLock(cwd, () => {
    const identity = prepareIdentityUpdate(cwd, n, patch);
    writeIdentityFile(cwd, n, identity);
    return identity;
  }, 'update-identity');
}
