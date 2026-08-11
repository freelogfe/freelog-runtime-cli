import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getCliEnv, type FreelogEnv } from './env.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

const AUTH_FILENAME = '.freelog-auth';

export interface AuthInfo {
  token: string;
  authorization?: string;
  cookie?: string;
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

export function getAuthPath(isGlobal = true): string {
  if (isGlobal) {
    const override = process.env.FREELOG_AUTH_PATH_GLOBAL;
    return override ? path.resolve(override) : path.join(os.homedir(), AUTH_FILENAME);
  }
  const override = process.env.FREELOG_AUTH_PATH_WORKSPACE;
  return override ? path.resolve(override) : getAuthPath(true);
}

export function saveAuth(auth: AuthInfo, isGlobal = true): void {
  const useWorkspace = !isGlobal && Boolean(process.env.FREELOG_AUTH_PATH_WORKSPACE);
  const authPath = getAuthPath(!useWorkspace);
  const body = {
    ...auth,
    token: encrypt(auth.token),
    authorization: auth.authorization ? encrypt(auth.authorization) : undefined,
    cookie: auth.cookie ? encrypt(auth.cookie) : undefined,
    encrypted: true,
    scope: useWorkspace ? 'workspace' : 'global',
    environment: auth.environment || getCliEnv(),
  };
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

export function clearAuth(isGlobal = true): void {
  if (!isGlobal && !process.env.FREELOG_AUTH_PATH_WORKSPACE) return;
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
      if (raw.cookie) raw.cookie = decrypt(raw.cookie);
    }
    return raw;
  } catch {
    return null;
  }
}

export function getAuth(isGlobal = true): AuthInfo | null {
  if (!isGlobal && !process.env.FREELOG_AUTH_PATH_WORKSPACE) return null;
  return readAuthFile(getAuthPath(isGlobal));
}

export function getCurrentAuth(): AuthInfo | null {
  const workspaceAuth = process.env.FREELOG_AUTH_PATH_WORKSPACE ? getAuth(false) : null;
  return workspaceAuth || getAuth(true);
}

export function requireAuth(): AuthInfo {
  const auth = getCurrentAuth();
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
