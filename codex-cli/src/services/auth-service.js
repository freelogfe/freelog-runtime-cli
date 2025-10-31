import path from 'node:path';
import crypto from 'node:crypto';
import { addDays, nowISO } from '../utils/datetime.js';
import { readJson, writeJson, removeIfExists } from '../utils/fs.js';
import {
  GLOBAL_CREDENTIALS_FILE,
  WORKSPACE_CREDENTIALS_FILE,
  WORKING_DIR
} from '../constants/paths.js';
import { getEnv } from '../config/env.js';
import { getHttpClient } from './http-client.js';
import { getLogger } from './logger.js';

const EXPIRY_DAYS = {
  global: 30,
  workspace: 7
};

export const AUTH_SCOPE = {
  GLOBAL: 'global',
  WORKSPACE: 'workspace'
};

export async function login({ username, password, scope }) {
  if (!username || !password) {
    throw new Error('用户名和密码不能为空。');
  }
  if (!Object.values(AUTH_SCOPE).includes(scope)) {
    throw new Error(`未知登录范围: ${scope}`);
  }

  const client = await getHttpClient();
  const logger = await getLogger();
  let response = null;
  try {
    response = await client.post(getEnv('FREELOG_LOGIN_ENDPOINT'), {
      loginName: username,
      password,
      jwtType: 'header'
    });
  } catch (error) {
    throw new Error(`登录失败: ${error.response?.data?.msg || error.message}`);
  }

  if (response.data?.errCode) {
    throw new Error(response.data.msg || '登录失败，请检查账号密码。');
  }

  const authorization = response.headers?.authorization;
  if (!authorization) {
    logger.warn('远端未返回 authorization 头部，将使用本地令牌。');
  }

  const loginTime = nowISO();
  const expiresAt = addDays(new Date(loginTime), EXPIRY_DAYS[scope]).toISOString();
  const payload = {
    username,
    scope,
    workspace: scope === AUTH_SCOPE.WORKSPACE ? path.resolve(WORKING_DIR) : null,
    loginTime,
    expiresAt,
    authorization: authorization || generateLocalToken(),
    refreshToken: response.headers?.['refresh_token'] ?? null,
    userInfo: response.data?.data ?? {}
  };

  await writeJson(resolveCredentialFile(scope), payload);
  return payload;
}

export async function logout(scope) {
  if (!scope) {
    return {
      global: await performLogout(AUTH_SCOPE.GLOBAL),
      workspace: await performLogout(AUTH_SCOPE.WORKSPACE)
    };
  }
  if (!Object.values(AUTH_SCOPE).includes(scope)) {
    throw new Error(`未知范围: ${scope}`);
  }
  const result = await performLogout(scope);
  return scope === AUTH_SCOPE.GLOBAL
    ? { global: result, workspace: false }
    : { global: false, workspace: result };
}

export async function getStatus() {
  const [global, workspace] = await Promise.all([
    readJson(GLOBAL_CREDENTIALS_FILE),
    readJson(WORKSPACE_CREDENTIALS_FILE)
  ]);
  return {
    global: enrichStatus(global),
    workspace: enrichStatus(workspace)
  };
}

export async function requireActiveCredential(preferredScope) {
  const status = await getStatus();
  if (preferredScope === AUTH_SCOPE.GLOBAL) {
    if (!status.global) {
      throw new Error('未检测到全局登录信息，请先执行 freelog-cli login -g。');
    }
    return { scope: AUTH_SCOPE.GLOBAL, credential: status.global };
  }
  if (preferredScope === AUTH_SCOPE.WORKSPACE) {
    if (!status.workspace) {
      throw new Error('未检测到工作空间登录信息，请先执行 freelog-cli login。');
    }
    return { scope: AUTH_SCOPE.WORKSPACE, credential: status.workspace };
  }
  if (status.workspace) {
    return { scope: AUTH_SCOPE.WORKSPACE, credential: status.workspace };
  }
  if (status.global) {
    return { scope: AUTH_SCOPE.GLOBAL, credential: status.global };
  }
  throw new Error('未检测到任何登录信息，请先执行 freelog-cli login。');
}

function resolveCredentialFile(scope) {
  return scope === AUTH_SCOPE.GLOBAL ? GLOBAL_CREDENTIALS_FILE : WORKSPACE_CREDENTIALS_FILE;
}

async function performLogout(scope) {
  const file = resolveCredentialFile(scope);
  const record = await readJson(file);
  if (!record) {
    return false;
  }
  const client = await getHttpClient();
  const logger = await getLogger();
  try {
    await client.post(
      getEnv('FREELOG_LOGOUT_ENDPOINT'),
      {},
      {
        headers: {
          authorization: record.authorization
        }
      }
    );
  } catch (error) {
    logger.warn(`调用退出接口失败，将继续清除本地凭证。错误: ${error.response?.data?.msg || error.message}`);
  }
  await removeIfExists(file);
  return true;
}

function enrichStatus(record) {
  if (!record) {
    return null;
  }
  const remainingMs = new Date(record.expiresAt).getTime() - Date.now();
  return {
    ...record,
    isExpired: remainingMs <= 0,
    remainingDays: Math.max(0, Math.round(remainingMs / (1000 * 60 * 60 * 24)))
  };
}

function generateLocalToken() {
  return `Local ${crypto.randomBytes(24).toString('hex')}`;
}
