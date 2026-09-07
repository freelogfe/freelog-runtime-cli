import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from '../core/atomicWrite';
import { CliError } from '../core/errors';
import type { FreelogEnv } from './types';

export type StoredAuth = {
  env: FreelogEnv;
  userId: number;
  loginName: string;
  token: string;
  /** dev 环境的会话凭据是 Cookie（authInfo + uid），token 仅作展示 */
  cookie?: string;
};

let authSearchCwd = process.cwd();

export function setAuthSearchCwd(cwd: string): void {
  authSearchCwd = cwd;
}

export function getAuthSearchCwd(): string {
  return authSearchCwd;
}

type AuthFile = {
  env: FreelogEnv;
  userId: number;
  loginName: string;
  iv: string;
  tag: string;
  token: string;
  cookieIv?: string;
  cookieTag?: string;
  cookie?: string;
};

const AUTH_KEY = createHash('sha256').update('freelog-cli-auth-v1').digest();

export function globalAuthPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.freelog-auth');
}

export function workspaceAuthPath(dir: string): string {
  return path.join(path.resolve(dir), '.freelog', 'auth');
}

function encryptToken(token: string): { iv: string; tag: string; token: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', AUTH_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    token: encrypted.toString('hex'),
  };
}

function decryptFields(
  file: AuthFile,
  field: 'token' | 'cookie',
): string {
  const iv = field === 'token' ? file.iv : file.cookieIv!;
  const tag = field === 'token' ? file.tag : file.cookieTag!;
  const value = field === 'token' ? file.token : file.cookie!;
  const decipher = createDecipheriv('aes-256-gcm', AUTH_KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(value, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

function decryptToken(file: AuthFile): string {
  return decryptFields(file, 'token');
}

function parseAuthFile(filePath: string): StoredAuth {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    // i18n: cli.auth.file_unreadable
    throw new CliError(`凭据文件损坏：${filePath}`, 'AUTH_INVALID');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    // i18n: cli.auth.file_invalid
    throw new CliError(`凭据文件损坏：${filePath}`, 'AUTH_INVALID');
  }
  const rec = raw as Record<string, unknown>;
  const hasCookie =
    typeof rec.cookieIv === 'string' &&
    typeof rec.cookieTag === 'string' &&
    typeof rec.cookie === 'string';
  if (
    (rec.env !== 'prod' && rec.env !== 'test' && rec.env !== 'dev') ||
    typeof rec.userId !== 'number' ||
    typeof rec.loginName !== 'string' ||
    typeof rec.iv !== 'string' ||
    typeof rec.tag !== 'string' ||
    typeof rec.token !== 'string' ||
    (rec.cookie !== undefined && !hasCookie)
  ) {
    // i18n: cli.auth.file_invalid
    throw new CliError(`凭据文件损坏：${filePath}`, 'AUTH_INVALID');
  }
  try {
    return {
      env: rec.env,
      userId: rec.userId,
      loginName: rec.loginName,
      token: decryptToken(rec as unknown as AuthFile),
      cookie: hasCookie
        ? decryptFields(rec as unknown as AuthFile, 'cookie')
        : undefined,
    };
  } catch {
    // i18n: cli.auth.file_unreadable
    throw new CliError(`凭据文件损坏：${filePath}`, 'AUTH_INVALID');
  }
}

export function writeAuth(filePath: string, auth: StoredAuth): void {
  const encrypted = encryptToken(auth.token);
  const cookie = auth.cookie ? encryptToken(auth.cookie) : undefined;
  atomicWriteFile(
    filePath,
    `${JSON.stringify(
      {
        env: auth.env,
        userId: auth.userId,
        loginName: auth.loginName,
        ...encrypted,
        ...(cookie
          ? { cookieIv: cookie.iv, cookieTag: cookie.tag, cookie: cookie.token }
          : {}),
      },
      null,
      2,
    )}\n`,
  );
}

export function deleteAuth(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  unlinkSync(filePath);
  return true;
}

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

export function loadAuth(options: {
  cwd: string;
  global?: boolean;
  homeDir?: string;
}): { path: string; auth: StoredAuth } | undefined {
  const homeDir = options.homeDir ?? os.homedir();
  if (options.global) {
    const filePath = globalAuthPath(homeDir);
    if (!existsSync(filePath)) {
      return undefined;
    }
    return { path: filePath, auth: parseAuthFile(filePath) };
  }

  const workspacePath = findWorkspaceAuthPath(options.cwd);
  if (workspacePath) {
    return { path: workspacePath, auth: parseAuthFile(workspacePath) };
  }

  const globalPath = globalAuthPath(homeDir);
  if (!existsSync(globalPath)) {
    return undefined;
  }
  return { path: globalPath, auth: parseAuthFile(globalPath) };
}

export function assertAuthEnv(auth: StoredAuth, env: FreelogEnv): void {
  if (auth.env !== env) {
    // i18n: cli.auth.env_mismatch
    throw new CliError(
      `当前凭据是 ${auth.env}，本次是 ${env}。请 logout 再 login --env ${env}`,
      'AUTH_ENV_MISMATCH',
    );
  }
}
