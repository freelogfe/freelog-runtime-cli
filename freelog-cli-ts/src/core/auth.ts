import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { AuthInfo } from '../types';
import { AuthError } from './errors';
import { AUTH_FILE } from './constants';
import { encrypt, decrypt } from '../utils/crypto';

function resolveAuthOverride(envValue?: string): string | undefined {
  return envValue ? path.resolve(envValue) : undefined;
}

/**
 * 从当前目录向上查找工作空间认证文件
 * 查找逻辑：从当前目录开始，逐级向上查找 .freelog-auth 文件，直到磁盘根目录
 */
function findWorkspaceAuthFile(startDir: string = process.cwd()): string | null {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (true) {
    const authFilePath = path.join(current, AUTH_FILE.workspace);
    if (fs.existsSync(authFilePath)) {
      return authFilePath;
    }
    
    // 如果到达磁盘根目录，停止查找
    if (current === root) {
      break;
    }
    
    const parent = path.dirname(current);
    // 如果父目录和当前目录相同（已到根目录），停止查找
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

function resolveWorkspaceAuthPath(): string {
  const override = resolveAuthOverride(process.env.FREELOG_AUTH_PATH_WORKSPACE);
  if (override) return override;
  
  // 从当前目录向上查找工作空间认证文件
  const foundAuthFile = findWorkspaceAuthFile();
  if (foundAuthFile) {
    return foundAuthFile;
  }
  
  // 如果没找到，返回当前目录下的认证文件路径（用于保存新认证）
  return path.join(process.cwd(), AUTH_FILE.workspace);
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

/**
 * 获取当前认证信息（优先工作空间，其次全局）
 * @returns 认证信息和来源类型，如果未找到则返回 null
 */
export function getCurrentAuth(): AuthInfo | null {
  return getAuth(false) || getAuth(true);
}

/**
 * 获取当前认证信息及其来源
 * @returns 包含认证信息和来源的对象，如果未找到则返回 null
 */
export function getCurrentAuthWithSource(): { auth: AuthInfo; isGlobal: boolean; authPath: string } | null {
  // 先查找工作空间认证
  const workspaceAuth = getAuth(false);
  if (workspaceAuth) {
    return {
      auth: workspaceAuth,
      isGlobal: false,
      authPath: getAuthPath(false),
    };
  }
  
  // 再查找全局认证
  const globalAuth = getAuth(true);
  if (globalAuth) {
    return {
      auth: globalAuth,
      isGlobal: true,
      authPath: getAuthPath(true),
    };
  }
  
  return null;
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
