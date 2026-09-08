/**
 * 账号选择器与秘密凭据分离：
 * - `.freelog/auth` / 用户级 `auth-default.json` 只保存非秘密 selector；
 * - token、cookie 仅写入系统凭据库。
 *
 * 本期不读取、解密或迁移旧 AES 凭据文件。旧文件需显式 logout 后重新登录。
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { systemCredentialStore } from '../adapters/credential/systemKeyring';
import { atomicWriteFile } from '../core/atomicWrite';
import { CliError } from '../core/errors';
import type { CredentialStore } from '../ports/credential';
import type { FreelogEnv } from './types';

export type StoredAuth = {
  env: FreelogEnv;
  userId: number;
  loginName: string;
  token: string;
  cookie?: string;
};

const selectorSchema = z.object({
  schemaVersion: z.literal(1),
  credentialKey: z.string().min(1),
  env: z.enum(['prod', 'test', 'dev']),
  userId: z.number().int().positive(),
  username: z.string().min(1),
  createdAt: z.string().datetime(),
}).strict();

const secretSchema = z.object({
  schemaVersion: z.literal(1),
  token: z.string().min(1),
  cookie: z.string().min(1).optional(),
}).strict();

type AuthSelector = z.infer<typeof selectorSchema>;

let authSearchCwd = process.cwd();
let credentialStore: CredentialStore = systemCredentialStore;

/** 测试替身注入点；生产运行始终使用系统凭据库。 */
export function setCredentialStoreForTests(store?: CredentialStore): void {
  credentialStore = store ?? systemCredentialStore;
}

/** 设置凭据搜索根（preAction 按 --cwd 调）。 */
export function setAuthSearchCwd(cwd: string): void {
  authSearchCwd = cwd;
}

/** 取得当前进程解析工作区 selector 的根目录。 */
export function getAuthSearchCwd(): string {
  return authSearchCwd;
}

/** 用户级配置目录内的机器默认 selector；其中绝不含 token。 */
export function globalAuthPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.freelog', 'auth-default.json');
}

/** 工程级 selector。 */
export function workspaceAuthPath(dir: string): string {
  return path.join(path.resolve(dir), '.freelog', 'auth');
}

function credentialKey(env: FreelogEnv, userId: number): string {
  return `v1/${env}/${userId}`;
}

function parseSelector(filePath: string): AuthSelector {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    throw new CliError(`凭据选择器损坏：${filePath}`, 'AUTH_INVALID');
  }
  const parsed = selectorSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  const record = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : undefined;
  if (record && ['token', 'cookie', 'iv', 'tag', 'cookieIv', 'cookieTag'].some((key) => key in record)) {
    throw new CliError(
      `发现旧凭据文件：${filePath}。请先 logout 再 login，CLI 不迁移旧秘密。`,
      'AUTH_LEGACY_RELOGIN',
    );
  }
  throw new CliError(`凭据选择器损坏：${filePath}`, 'AUTH_INVALID');
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function loadSecret(selector: AuthSelector, selectorPath: string): Pick<StoredAuth, 'token' | 'cookie'> {
  let raw: string | undefined;
  try {
    raw = credentialStore.get(selector.credentialKey);
  } catch {
    throw new CliError('系统凭据库不可用，请解锁后重试 login', 'CREDENTIAL_STORE_UNAVAILABLE');
  }
  if (!raw) {
    throw new CliError(
      `系统凭据库中不存在 ${selectorPath} 引用的凭据，请重新 login`,
      'AUTH_CREDENTIAL_MISSING',
    );
  }
  const parsed = secretSchema.safeParse(safeJsonParse(raw));
  if (!parsed.success) {
    throw new CliError('系统凭据库中的凭据损坏，请重新 login', 'AUTH_CREDENTIAL_INVALID');
  }
  return parsed.data;
}

/** 只供登录 use case 调用：先写系统凭据库，成功后才原子写 selector。 */
export function writeAuth(filePath: string, auth: StoredAuth): void {
  const key = credentialKey(auth.env, auth.userId);
  try {
    credentialStore.set(key, JSON.stringify({
      schemaVersion: 1,
      token: auth.token,
      ...(auth.cookie ? { cookie: auth.cookie } : {}),
    }));
  } catch {
    throw new CliError('系统凭据库不可用，登录未保存', 'CREDENTIAL_STORE_UNAVAILABLE');
  }
  const selector: AuthSelector = {
    schemaVersion: 1,
    credentialKey: key,
    env: auth.env,
    userId: auth.userId,
    username: auth.loginName,
    createdAt: new Date().toISOString(),
  };
  atomicWriteFile(filePath, `${JSON.stringify(selector, null, 2)}\n`);
}

/**
 * logout 仅删精确 selector。凭据库条目可能仍被其它 selector 引用，故不做不可靠的全盘扫描删除。
 * 不解析文件内容使用户可以显式清理旧 selector。
 */
export function deleteAuth(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  unlinkSync(filePath);
  return true;
}

/** 从 startDir 逐级向上找最近的工作区 selector。 */
export function findWorkspaceAuthPath(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = workspaceAuthPath(dir);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/** 命中工作区 selector 后绝不回退全局；global 只读用户级 selector。 */
export function loadAuth(options: {
  cwd: string;
  global?: boolean;
  homeDir?: string;
}): { path: string; auth: StoredAuth } | undefined {
  const homeDir = options.homeDir ?? os.homedir();
  const filePath = options.global
    ? globalAuthPath(homeDir)
    : findWorkspaceAuthPath(options.cwd) ?? globalAuthPath(homeDir);
  if (!existsSync(filePath)) {
    return undefined;
  }
  const selector = parseSelector(filePath);
  const secret = loadSecret(selector, filePath);
  return {
    path: filePath,
    auth: {
      env: selector.env,
      userId: selector.userId,
      loginName: selector.username,
      ...secret,
    },
  };
}

/** 一份 selector 只可用于与其写入时相同的环境。 */
export function assertAuthEnv(auth: StoredAuth, env: FreelogEnv): void {
  if (auth.env !== env) {
    throw new CliError(
      `当前凭据是 ${auth.env}，本次是 ${env}。请 logout 再 login --env ${env}`,
      'AUTH_ENV_MISMATCH',
    );
  }
}
