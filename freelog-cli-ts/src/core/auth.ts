import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { AuthInfo } from '../types';
import { AuthError } from './errors';
import { AUTH_FILE } from './constants';
import { encrypt, decrypt } from '../utils/crypto';
import { findWorkspaceRoot } from './config';

function resolveAuthOverride(envValue?: string): string | undefined {
  return envValue ? path.resolve(envValue) : undefined;
}

function resolveWorkspaceAuthPath(): string {
  const override = resolveAuthOverride(process.env.FREELOG_AUTH_PATH_WORKSPACE);
  if (override) return override;
  const workspaceRoot = findWorkspaceRoot() || process.cwd();
  return path.join(workspaceRoot, AUTH_FILE.workspace);
}

function resolveGlobalAuthPath(): string {
  const override = resolveAuthOverride(process.env.FREELOG_AUTH_PATH_GLOBAL);
  if (override) return override;
  return path.join(os.homedir(), AUTH_FILE.global);
}

export function getAuthPath(isGlobal = false): string {
  return isGlobal ? resolveGlobalAuthPath() : resolveWorkspaceAuthPath();
}

export function saveAuth(authInfo: AuthInfo, isGlobal = false): void {
  const authPath = getAuthPath(isGlobal);
  const encryptedAuth = {
    ...authInfo,
    token: encrypt(authInfo.token),
    authorization: authInfo.authorization ? encrypt(authInfo.authorization) : undefined,
    encrypted: true,
    scope: isGlobal ? 'global' : 'workspace'
  };
  fs.ensureDirSync(path.dirname(authPath));
  fs.writeJsonSync(authPath, encryptedAuth, { spaces: 2 });
}

export function getAuth(isGlobal = false): AuthInfo | null {
  const authPath = getAuthPath(isGlobal);
  if (!fs.existsSync(authPath)) return null;
  try {
    const authData = fs.readJsonSync(authPath);
    if (authData.encrypted) {
      authData.token = decrypt(authData.token);
      if (authData.authorization) authData.authorization = decrypt(authData.authorization);
    }
    return authData as AuthInfo;
  } catch {
    return null;
  }
}

export function getCurrentAuth(): AuthInfo | null {
  return getAuth(false) || getAuth(true);
}

export function requireAuth(): AuthInfo {
  const auth = getCurrentAuth();
  if (!auth) throw new AuthError('请先登录: freelog-cli login');
  return auth;
}

export function clearAuth(isGlobal = false): void {
  const authPath = getAuthPath(isGlobal);
  if (fs.existsSync(authPath)) fs.removeSync(authPath);
}
