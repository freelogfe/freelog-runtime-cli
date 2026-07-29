import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { CliError } from './errors.js';
import { getCliEnv, type FreelogEnv } from './env.js';

const AUTH_FILENAME = '.freelog-auth';

export interface AuthInfo {
  token: string;
  authorization?: string;
  userId?: number | string;
  username?: string;
  environment: FreelogEnv;
  encrypted?: boolean;
  scope?: 'global' | 'workspace';
}

function deriveKey(): Buffer {
  const secret = process.env.FREELOG_CRYPTO_KEY || 'freelog-cli-secret-key-32chars!!';
  return createHash('sha256').update(secret).digest();
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

function findWorkspaceAuthFile(startDir: string = process.cwd()): string | null {
  let current = path.resolve(startDir);
  const { root } = path.parse(current);
  while (true) {
    const candidate = path.join(current, AUTH_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function getAuthPath(isGlobal = false): string {
  if (isGlobal) {
    const override = process.env.FREELOG_AUTH_PATH_GLOBAL;
    return override ? path.resolve(override) : path.join(os.homedir(), AUTH_FILENAME);
  }
  const override = process.env.FREELOG_AUTH_PATH_WORKSPACE;
  if (override) return path.resolve(override);
  return findWorkspaceAuthFile() ?? path.join(process.cwd(), AUTH_FILENAME);
}

export function saveAuth(auth: AuthInfo, isGlobal = false): void {
  const authPath = getAuthPath(isGlobal);
  const body = {
    ...auth,
    token: encrypt(auth.token),
    authorization: auth.authorization ? encrypt(auth.authorization) : undefined,
    encrypted: true,
    scope: isGlobal ? 'global' : 'workspace',
    environment: auth.environment || getCliEnv(),
  };
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

export function clearAuth(isGlobal = false): void {
  const authPath = getAuthPath(isGlobal);
  if (fs.existsSync(authPath)) fs.unlinkSync(authPath);
}

function readAuthFile(authPath: string): AuthInfo | null {
  if (!fs.existsSync(authPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(authPath, 'utf8')) as AuthInfo & {
      encrypted?: boolean;
    };
    if (raw.encrypted) {
      raw.token = decrypt(raw.token);
      if (raw.authorization) raw.authorization = decrypt(raw.authorization);
    }
    return raw;
  } catch {
    return null;
  }
}

export function getAuth(isGlobal = false): AuthInfo | null {
  return readAuthFile(getAuthPath(isGlobal));
}

export function getCurrentAuth(): AuthInfo | null {
  return getAuth(false) || getAuth(true);
}

export function requireAuth(): AuthInfo {
  const auth = getCurrentAuth();
  if (!auth?.token) {
    throw new CliError('未登录', { code: 2, hint: 'freelog-cli login' });
  }
  if (auth.environment && auth.environment !== getCliEnv()) {
    throw new CliError('登录环境与当前 API 环境不一致', {
      code: 2,
      hint: `请使用对应环境重新 login（当前 ${getCliEnv()}，凭证 ${auth.environment}）`,
    });
  }
  return auth;
}
