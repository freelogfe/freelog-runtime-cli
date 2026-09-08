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
import type {
  IdentityRecord,
  IdentityWriteInput,
  ResourceIdentity,
} from './types';

const IDENTITY_FILE_RE = /^([1-9]\d*)\.json$/;

const inputFields = {
  subject: z.literal('resource'),
  resourceId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  typeCode: z.string().min(1),
  filePath: z.string().min(1).optional(),
  env: z.enum(['prod', 'test', 'dev']).optional(),
};

const createSchema = z.object(inputFields).strict();
const patchSchema = z.object(inputFields).partial().strict();
const storedSchema = z.object({
  schemaVersion: z.literal(1),
  ...inputFields,
}).strict().superRefine((identity, ctx) => {
  const hasResourceId = identity.resourceId !== undefined;
  const hasName = identity.name !== undefined;
  const bound = hasResourceId || hasName;
  if (hasResourceId !== hasName) {
    ctx.addIssue({
      code: ZodIssueCode.custom,
      path: hasResourceId ? ['name'] : ['resourceId'],
      message: '绑定身份必须同时包含 resourceId 和 name',
    });
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
  if (field === 'name' || field === 'resourceId') {
    throw new CliError('绑定身份必须同时包含 resourceId 和 name', 'IDENTITY_BINDING_INVALID');
  }
  throw new CliError('身份字段无效', 'IDENTITY_INVALID');
}

function toStored(data: z.infer<typeof storedSchema>): ResourceIdentity {
  return {
    schemaVersion: 1,
    subject: data.subject,
    ...(data.resourceId ? { resourceId: data.resourceId } : {}),
    ...(data.name ? { name: data.name } : {}),
    typeCode: data.typeCode,
    ...(data.filePath ? { filePath: data.filePath } : {}),
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
    ...(identity.name ? { name: identity.name } : {}),
    typeCode: identity.typeCode,
    ...(identity.filePath ? { filePath: identity.filePath } : {}),
    ...(identity.env ? { env: identity.env } : {}),
  };
}

function writeIdentityFile(cwd: string, n: number, identity: ResourceIdentity): void {
  atomicWriteFile(identityFilePath(cwd, n), `${JSON.stringify(toDiskObject(identity), null, 2)}\n`);
}

function parseCreateInput(input: IdentityWriteInput): ResourceIdentity {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    throwZodAsCliError(parsed.error);
  }
  return normalize(parsed.data);
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

/** 仅枚举身份编号；工作稿和模板缓存不参与编号。 */
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

function nextIdentityNumber(cwd: string): number {
  const numbers = listIdentityNumbers(cwd);
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}

/** 新建身份；编号取 max+1 且永不复用。 */
export function createIdentity(
  cwd: string,
  input: IdentityWriteInput & Record<string, unknown>,
): IdentityRecord {
  return withProjectLock(cwd, () => {
    const identity = parseCreateInput(input);
    const n = nextIdentityNumber(cwd);
    writeIdentityFile(cwd, n, identity);
    return { n, ...identity };
  }, 'create-identity');
}

/** 修改后重新验证整体不变量，不能以局部 patch 绕过未绑定/绑定边界。 */
export function updateIdentity(
  cwd: string,
  n: number,
  patch: Partial<IdentityWriteInput> & Record<string, unknown>,
): IdentityRecord {
  return withProjectLock(cwd, () => {
    const current = readIdentity(cwd, n);
    const parsed = parsePatchInput(patch);
    const identity = normalize({
      subject: parsed.subject ?? current.subject,
      resourceId: parsed.resourceId ?? current.resourceId,
      name: parsed.name ?? current.name,
      typeCode: parsed.typeCode ?? current.typeCode,
      filePath: parsed.filePath ?? current.filePath,
      env: parsed.env ?? current.env,
    });
    writeIdentityFile(cwd, n, identity);
    return { n, ...identity };
  }, 'update-identity');
}
