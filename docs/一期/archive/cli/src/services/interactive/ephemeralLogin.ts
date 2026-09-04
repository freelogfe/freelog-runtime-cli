import * as p from '@clack/prompts';
import { consola } from 'consola';
import {
  authScopeLabel,
  getEphemeralAuth,
  setEphemeralAuth,
  type AuthInfo,
} from '../../core/auth.js';
import { getCliEnv } from '../../core/env.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { isInteractive } from '../../core/tty.js';
import { fetchLoginAuth, isLoginTokenMissingError } from '../auth/loginFlow.js';

export async function promptEphemeralLogin(opts?: {
  loginName?: string;
  password?: string;
  yes?: boolean;
}): Promise<AuthInfo> {
  let loginName = opts?.loginName?.trim();
  let password = opts?.password;

  if ((!loginName || !password) && isInteractive(opts?.yes)) {
    const answers = await p.group({
      loginName: () => p.text({ message: '登录名', defaultValue: loginName }),
      password: () => p.password({ message: '密码' }),
    });
    if (p.isCancel(answers)) {
      consola.info('已取消');
      process.exitCode = 0;
      throw new Error('interactive_cancelled');
    }
    loginName = String(answers.loginName);
    password = String(answers.password);
  }

  if (!loginName || !password) {
    throw cliError(I18N_KEYS.missing_login_credentials, {
      code: 4,
      hint: 'freelog-cli login --login-name <name> --password <pwd> --yes',
    });
  }

  try {
    const auth = await fetchLoginAuth(loginName, password);
    setEphemeralAuth(auth);
    consola.success(
      `已登录 ${auth.username || loginName}（${auth.environment}，${authScopeLabel('ephemeral')}）`,
    );
    return auth;
  } catch (error) {
    if (isLoginTokenMissingError(error)) {
      throw cliError(I18N_KEYS.login_response_missing_token, { code: 1 });
    }
    throw error;
  }
}

/** 确保 studio/session 进程内已有 ephemeral 凭据；绝不读取磁盘 auth。 */
export async function ensureEphemeralLogin(): Promise<AuthInfo> {
  const existing = getEphemeralAuth();
  if (existing?.token) {
    if (existing.environment !== getCliEnv()) {
      throw cliError(I18N_KEYS.login_env_mismatch, {
        code: 2,
        hint: `请在当前 ${getCliEnv()} 环境重新进行临时登录`,
      });
    }
    return existing;
  }
  return promptEphemeralLogin();
}

export async function promptSwitchEphemeralAccount(): Promise<AuthInfo> {
  consola.info('切换账号：重新登录（凭据仍不落盘）');
  return promptEphemeralLogin();
}

export function isInteractiveCancelled(error: unknown): boolean {
  return error instanceof Error && error.message === 'interactive_cancelled';
}
