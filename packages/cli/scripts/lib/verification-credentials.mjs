import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localCredentialsPath = path.resolve(
  __dirname,
  '../../../../test/.freelog-test-credentials.local.json',
);

function requireSafeEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少 ${name}；真实环境验证凭据只能通过环境变量提供`);
  }
  if (!/^[\w@.+-]+$/.test(value)) {
    throw new Error(`${name} 包含脚本命令不支持的字符`);
  }
  return value;
}

let cachedLocalCredentials;

function loadLocalCredentialsFile() {
  if (cachedLocalCredentials !== undefined) return cachedLocalCredentials;
  cachedLocalCredentials = null;
  if (!fs.existsSync(localCredentialsPath)) return null;
  try {
    const text = fs.readFileSync(localCredentialsPath, 'utf8').replace(/^\uFEFF/, '');
    const raw = JSON.parse(text);
    cachedLocalCredentials = raw;
    return raw;
  } catch {
    return null;
  }
}

function readLocalAccount(kind) {
  const file = loadLocalCredentialsFile();
  const row = file?.[kind === 'secondary' ? 'secondary' : 'primary'];
  const name = row?.loginName?.trim();
  const password = row?.password?.trim();
  if (!name || !password) return null;
  return { name, password, source: 'local-file' };
}

function readAuthUsername() {
  try {
    const authPath = process.env.FREELOG_AUTH_PATH_GLOBAL
      ? path.resolve(process.env.FREELOG_AUTH_PATH_GLOBAL)
      : path.join(os.homedir(), '.freelog-auth');
    if (!fs.existsSync(authPath)) return null;
    const raw = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    return typeof raw.username === 'string' ? raw.username.trim() : null;
  } catch {
    return null;
  }
}

/** @returns {{ name: string, password: string, source: 'env' | 'local-file' | 'session' } | null} */
export function verificationAccount(kind = 'primary') {
  const prefix = kind === 'secondary' ? 'FREELOG_TEST_SECONDARY_' : 'FREELOG_TEST_';
  const name = process.env[`${prefix}LOGIN_NAME`]?.trim();
  const password = process.env[`${prefix}PASSWORD`]?.trim();
  if (name && password) {
    return { name, password, source: 'env' };
  }
  const local = readLocalAccount(kind);
  if (local) return local;
  if (kind === 'primary') {
    const sessionUser = readAuthUsername();
    if (sessionUser) {
      return { name: sessionUser, password: '', source: 'session' };
    }
  }
  if (kind === 'secondary') {
    return null;
  }
  throw new Error(
    `缺少 ${prefix}LOGIN_NAME / ${prefix}PASSWORD；或配置 test/.freelog-test-credentials.local.json；或先执行 freelog-cli login --env dev`,
  );
}

export function verificationLoginArgs(kind = 'primary') {
  const account = verificationAccount(kind);
  if (!account) {
    throw new Error('辅账号未配置（FREELOG_TEST_SECONDARY_* 或 test/.freelog-test-credentials.local.json）');
  }
  if (account.source === 'session') {
    return 'status --json';
  }
  return `login --global --login-name ${account.name} --password ${account.password} --yes`;
}
