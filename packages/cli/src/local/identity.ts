import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z, ZodIssueCode } from 'zod';
import { atomicWriteFile } from '../core/atomicWrite';
import { CliError } from '../core/errors';
import type {
  FreelogEnv,
  IdentityRecord,
  IdentityWriteInput,
  ResourceIdentity,
} from './types';

const IDENTITY_FILE_RE = /^([1-9]\d*)\.json$/;

const writeFields = {
  subject: z.literal('resource'),
  resourceId: z.string().min(1).optional(),
  name: z.string().min(1),
  typeCode: z.string().min(1),
  filePath: z.string().min(1).optional(),
  env: z.enum(['prod', 'test', 'dev']).optional(),
};

const createSchema = z.object(writeFields).strict();
const patchSchema = z.object(writeFields).partial().strict();

const storedSchema = z.object({
  subject: z.literal('resource'),
  resourceId: z.string().min(1).optional(),
  name: z.string().min(1),
  typeCode: z.string().min(1),
  filePath: z.string().min(1).optional(),
  env: z
    .enum(['prod', 'test', 'dev'])
    .optional()
    .transform((value): Exclude<FreelogEnv, 'prod'> | undefined => {
      return value === 'test' || value === 'dev' ? value : undefined;
    }),
});

export function freelogDir(cwd: string): string {
  return path.join(path.resolve(cwd), '.freelog');
}

export function identityFilePath(cwd: string, n: number): string {
  return path.join(freelogDir(cwd), `${n}.json`);
}

function assertIdentityNumber(n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    // i18n: cli.local.identity_number_invalid
    throw new CliError('身份编号无效', 'IDENTITY_INVALID');
  }
}

function throwZodAsCliError(error: z.ZodError): never {
  const unrecognized = error.issues.find(
    (issue) => issue.code === ZodIssueCode.unrecognized_keys,
  );
  if (unrecognized && unrecognized.code === ZodIssueCode.unrecognized_keys) {
    // i18n: cli.local.identity_forbidden_field
    throw new CliError(
      `N.json 不能写入 ${unrecognized.keys.join('、')}`,
      'IDENTITY_FORBIDDEN_FIELD',
    );
  }

  const first = error.issues[0];
  const field = first?.path[0];
  if (field === 'env') {
    // i18n: cli.local.identity_env_invalid
    throw new CliError('环境只能是 prod、test 或 dev', 'IDENTITY_ENV_INVALID');
  }
  if (field === 'subject') {
    // i18n: cli.local.identity_subject_unsupported
    throw new CliError('本期只支持普通单资源', 'IDENTITY_SUBJECT_UNSUPPORTED');
  }
  // i18n: cli.local.identity_invalid
  throw new CliError('身份字段无效', 'IDENTITY_INVALID');
}

function toStored(data: IdentityWriteInput): ResourceIdentity {
  const stored: ResourceIdentity = {
    subject: data.subject,
    name: data.name,
    typeCode: data.typeCode,
  };
  if (data.resourceId !== undefined) {
    stored.resourceId = data.resourceId;
  }
  if (data.filePath !== undefined) {
    stored.filePath = data.filePath;
  }
  if (data.env === 'test' || data.env === 'dev') {
    stored.env = data.env;
  }
  return stored;
}

function toDiskObject(identity: ResourceIdentity): Record<string, unknown> {
  const out: Record<string, unknown> = {
    subject: identity.subject,
  };
  if (identity.resourceId !== undefined) {
    out.resourceId = identity.resourceId;
  }
  out.name = identity.name;
  out.typeCode = identity.typeCode;
  if (identity.filePath !== undefined) {
    out.filePath = identity.filePath;
  }
  if (identity.env !== undefined) {
    out.env = identity.env;
  }
  return out;
}

function writeIdentityFile(cwd: string, n: number, identity: ResourceIdentity): void {
  atomicWriteFile(
    identityFilePath(cwd, n),
    `${JSON.stringify(toDiskObject(identity), null, 2)}\n`,
  );
}

function parseCreateInput(input: IdentityWriteInput): ResourceIdentity {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    throwZodAsCliError(parsed.error);
  }
  return toStored(parsed.data);
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
    // i18n: cli.local.identity_file_invalid
    throw new CliError(`身份文件 ${n}.json 无效`, 'IDENTITY_INVALID');
  }
  return toStored(parsed.data);
}

export function listIdentities(cwd: string): IdentityRecord[] {
  return listIdentityNumbers(cwd).map((n) => readIdentity(cwd, n));
}

export function listIdentityNumbers(cwd: string): number[] {
  const dir = freelogDir(cwd);
  if (!existsSync(dir)) {
    return [];
  }
  const numbers: number[] = [];
  for (const name of readdirSync(dir)) {
    const match = IDENTITY_FILE_RE.exec(name);
    if (match) {
      numbers.push(Number(match[1]));
    }
  }
  return numbers.sort((a, b) => a - b);
}

function nextIdentityNumber(cwd: string): number {
  const numbers = listIdentityNumbers(cwd);
  if (numbers.length === 0) {
    return 1;
  }
  return Math.max(...numbers) + 1;
}

export function createIdentity(
  cwd: string,
  input: IdentityWriteInput & Record<string, unknown>,
): IdentityRecord {
  const identity = parseCreateInput(input);
  const n = nextIdentityNumber(cwd);
  writeIdentityFile(cwd, n, identity);
  return { n, ...identity };
}

export function readIdentity(cwd: string, n: number): IdentityRecord {
  assertIdentityNumber(n);
  const filePath = identityFilePath(cwd, n);
  if (!existsSync(filePath)) {
    // i18n: cli.local.identity_not_found
    throw new CliError(`找不到身份文件 ${n}.json`, 'IDENTITY_NOT_FOUND');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    // i18n: cli.local.identity_file_unreadable
    throw new CliError(`身份文件 ${n}.json 无法解析`, 'IDENTITY_INVALID');
  }
  return { n, ...parseStoredIdentity(raw, n) };
}

export function updateIdentity(
  cwd: string,
  n: number,
  patch: Partial<IdentityWriteInput> & Record<string, unknown>,
): IdentityRecord {
  const current = readIdentity(cwd, n);
  const parsed = parsePatchInput(patch);
  const identity = toStored({
    subject: parsed.subject ?? current.subject,
    name: parsed.name ?? current.name,
    typeCode: parsed.typeCode ?? current.typeCode,
    resourceId: parsed.resourceId ?? current.resourceId,
    filePath: parsed.filePath ?? current.filePath,
    env: parsed.env ?? current.env,
  });
  writeIdentityFile(cwd, n, identity);
  return { n, ...identity };
}
