import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { atomicWriteFile } from './atomicWrite.js';
import { getCliEnv, type FreelogEnv } from './env.js';
import type { CliError } from './errors.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

const AUTH_FILENAME = '.freelog-auth';
const CRYPTO_KEY_FILENAME = 'auth.key';

export interface AuthInfo {
  token: string;
  authorization?: string;
  cookie?: string;
  userId?: number | string;
  username?: string;
  environment: FreelogEnv;
  encrypted?: boolean;
  scope?: AuthScope;
}

export type AuthScope = 'global' | 'workspace' | 'ephemeral';
export type PersistedAuthScope = Exclude<AuthScope, 'ephemeral'>;

export interface ResolvedAuth {
  auth: AuthInfo;
  scope: AuthScope;
  path: string;
}

export type ResolvedAuthTarget = Pick<ResolvedAuth, 'scope' | 'path'>;

export interface SaveAuthOptions {
  scope: PersistedAuthScope;
  cwd?: string;
}

let authResolveCwd: string | undefined;
let ephemeralAuth: AuthInfo | null = null;

/** studio / session 进程内 no-save 登录；进程结束应 clearEphemeralAuth。 */
export function setEphemeralAuth(auth: AuthInfo | null): void {
  ephemeralAuth = auth;
}

export function clearEphemeralAuth(): void {
  ephemeralAuth = null;
}

export function getEphemeralAuth(): AuthInfo | null {
  return ephemeralAuth;
}

/** 命令层传入 `--cwd` 时设置；否则解析时使用 `process.cwd()`。 */
export function setAuthResolveCwd(cwd?: string): void {
  authResolveCwd = cwd ? path.resolve(cwd) : undefined;
}

export function getAuthResolveCwd(): string {
  return authResolveCwd ?? process.cwd();
}

function getCryptoKeyPath(): string {
  const override = process.env.FREELOG_CRYPTO_KEY_PATH?.trim();
  return override
    ? path.resolve(override)
    : path.join(os.homedir(), '.freelog-cli', CRYPTO_KEY_FILENAME);
}

function readOrCreateUserCryptoKey(): Buffer {
  const keyPath = getCryptoKeyPath();
  try {
    const existing = fs.readFileSync(keyPath, 'utf8').trim();
    const key = Buffer.from(existing, 'base64');
    if (key.length !== 32) throw new Error(`Invalid credential key at ${keyPath}`);
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const key = randomBytes(32);
  try {
    fs.writeFileSync(keyPath, key.toString('base64'), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = fs.readFileSync(keyPath, 'utf8').trim();
    const concurrentKey = Buffer.from(existing, 'base64');
    if (concurrentKey.length !== 32) throw new Error(`Invalid credential key at ${keyPath}`);
    return concurrentKey;
  }
}

function deriveKey(): Buffer {
  const secret = process.env.FREELOG_CRYPTO_KEY?.trim();
  return secret
    ? createHash('sha256').update(secret).digest()
    : readOrCreateUserCryptoKey();
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** 工作区凭据写入前保证同目录 `.gitignore` 明确忽略该文件。 */
function ensureWorkspaceAuthGitignored(authPath: string): void {
  const gitignorePath = path.join(path.dirname(authPath), '.gitignore');
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const lastRule = existing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .at(-1);
  if (lastRule === AUTH_FILENAME || lastRule === `/${AUTH_FILENAME}`) return;

  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  atomicWriteFile(gitignorePath, `${existing}${prefix}/${AUTH_FILENAME}\n`);
}

export function getGlobalAuthPath(): string {
  const override = process.env.FREELOG_AUTH_PATH_GLOBAL;
  return override ? path.resolve(override) : path.join(os.homedir(), AUTH_FILENAME);
}

function getTestWorkspaceAuthPath(): string | null {
  const override = process.env.FREELOG_AUTH_PATH_WORKSPACE?.trim();
  return override ? path.resolve(override) : null;
}

/** 工作区凭据写入路径（login 默认）。 */
export function getWorkspaceAuthWritePath(cwd?: string): string {
  const testPath = getTestWorkspaceAuthPath();
  if (testPath) return testPath;
  return path.join(path.resolve(cwd ?? getAuthResolveCwd()), AUTH_FILENAME);
}

/** 自 startCwd 向上查找第一份 `.freelog-auth`（测试 env 覆盖时只读该路径）。 */
export function findWorkspaceAuthFile(startCwd?: string): string | null {
  const testPath = getTestWorkspaceAuthPath();
  if (testPath) {
    return fs.existsSync(testPath) ? testPath : null;
  }

  const comparablePath = (file: string) => {
    const resolved = path.resolve(file);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  const reservedGlobalPaths = new Set(
    [getGlobalAuthPath(), path.join(os.homedir(), AUTH_FILENAME)].map(comparablePath),
  );
  let dir = path.resolve(startCwd ?? getAuthResolveCwd());
  for (;;) {
    const candidate = path.join(dir, AUTH_FILENAME);
    if (fs.existsSync(candidate) && !reservedGlobalPaths.has(comparablePath(candidate))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function saveAuth(auth: AuthInfo, opts: SaveAuthOptions): void {
  const authPath =
    opts.scope === 'global' ? getGlobalAuthPath() : getWorkspaceAuthWritePath(opts.cwd);
  if (opts.scope === 'workspace') ensureWorkspaceAuthGitignored(authPath);
  const body = {
    ...auth,
    token: encrypt(auth.token),
    authorization: auth.authorization ? encrypt(auth.authorization) : undefined,
    cookie: auth.cookie ? encrypt(auth.cookie) : undefined,
    encrypted: true,
    scope: opts.scope,
    environment: auth.environment || getCliEnv(),
  };
  atomicWriteFile(authPath, `${JSON.stringify(body, null, 2)}\n`, 0o600);
}

export function clearAuthFile(authPath: string): boolean {
  if (!fs.existsSync(authPath)) return false;
  fs.unlinkSync(authPath);
  return true;
}

/** 删除当前上下文解析命中的凭据（logout 默认）。 */
export function clearResolvedAuth(cwd?: string): boolean {
  const target = resolveAuthTarget(cwd);
  if (!target) return false;
  if (target.scope === 'ephemeral') {
    clearEphemeralAuth();
    return true;
  }
  return clearAuthFile(target.path);
}

/** 仅删除全局凭据（logout --global）。 */
export function clearGlobalAuth(): boolean {
  return clearAuthFile(getGlobalAuthPath());
}

function invalidAuthFileError(authPath: string, cause?: unknown): CliError {
  return cliError(I18N_KEYS.auth_file_unreadable, {
    code: 2,
    params: { path: authPath },
    hint: '请重新执行 freelog-cli login 覆盖凭据，或执行 freelog-cli logout 清除损坏文件',
    details: { authPath },
    cause,
  });
}

function readAuthFile(authPath: string): AuthInfo | null {
  if (!fs.existsSync(authPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(authPath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Credential file must contain a JSON object');
    }
    const raw = parsed as AuthInfo & {
      encrypted?: boolean;
    };
    if (raw.encrypted) {
      if (typeof raw.token !== 'string' || !raw.token) {
        throw new Error('Encrypted credential is missing token');
      }
      raw.token = decrypt(raw.token);
      if (raw.authorization) raw.authorization = decrypt(raw.authorization);
      if (raw.cookie) raw.cookie = decrypt(raw.cookie);
    }
    if (typeof raw.token !== 'string' || !raw.token.trim()) {
      throw new Error('Credential is missing token');
    }
    return raw;
  } catch (error) {
    throw invalidAuthFileError(authPath, error);
  }
}

/** @deprecated 使用 resolveCurrentAuth / getGlobalAuthPath */
export function getAuth(isGlobal = true): AuthInfo | null {
  if (isGlobal) return readAuthFile(getGlobalAuthPath());
  const ws = findWorkspaceAuthFile();
  return ws ? readAuthFile(ws) : null;
}

/** 不读取凭据内容，只定位当前上下文应使用或清除的凭据。 */
export function resolveAuthTarget(startCwd?: string): ResolvedAuthTarget | null {
  if (ephemeralAuth?.token) {
    return { scope: 'ephemeral', path: '(memory)' };
  }

  const cwd = startCwd ? path.resolve(startCwd) : getAuthResolveCwd();
  const workspacePath = findWorkspaceAuthFile(cwd);
  if (workspacePath) return { scope: 'workspace', path: workspacePath };

  const globalPath = getGlobalAuthPath();
  return fs.existsSync(globalPath) ? { scope: 'global', path: globalPath } : null;
}

/** 自 cwd 向上查找工作区凭据；仅在文件不存在时回退全局，损坏凭据必须显式失败。 */
export function resolveCurrentAuth(startCwd?: string): ResolvedAuth | null {
  const target = resolveAuthTarget(startCwd);
  if (!target) return null;
  if (target.scope === 'ephemeral') {
    return { auth: ephemeralAuth!, ...target };
  }

  const auth = readAuthFile(target.path);
  if (auth) return { auth, ...target };

  return null;
}

export function getCurrentAuth(startCwd?: string): AuthInfo | null {
  return resolveCurrentAuth(startCwd)?.auth ?? null;
}

export function authScopeLabel(scope: AuthScope): string {
  if (scope === 'ephemeral') return '临时会话·不落盘';
  return scope === 'workspace' ? '工作区凭据' : '全局凭据';
}

/** 供终端提示：当前登录账号、环境与凭据来源。 */
export function formatAuthContextLine(resolved: ResolvedAuth): string {
  const { auth, scope } = resolved;
  const who = auth.username || auth.userId || '未知用户';
  const env = auth.environment || getCliEnv();
  return `当前登录: ${who}（${env}，${authScopeLabel(scope)}）`;
}

export function requireAuth(startCwd?: string): AuthInfo {
  const resolved = resolveCurrentAuth(startCwd);
  const auth = resolved?.auth;
  if (!auth?.token) {
    throw cliError(I18N_KEYS.not_logged_in, { code: 2, hint: 'freelog-cli login' });
  }
  if (auth.environment && auth.environment !== getCliEnv()) {
    throw cliError(I18N_KEYS.login_env_mismatch, {
      code: 2,
      hint: `请使用对应环境重新 login（当前 ${getCliEnv()}，凭证 ${auth.environment}）`,
    });
  }
  return auth;
}
