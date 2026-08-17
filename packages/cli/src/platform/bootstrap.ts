import { FUtil } from './tools-lib.js';
import { assertCliEnvEnabled, getCliEnv } from '../core/env.js';
import { getCurrentAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

let bootstrapped = false;

export interface PlatformEnvelope<T = unknown> {
  ret?: number;
  errCode?: number;
  errcode?: number;
  msg?: string;
  data?: T;
}

/** 配置 tools-lib2 Node adapter：环境、Cookie/Authorization 和 CLI 风格鉴权错误。 */
export function installToolsLibForNode(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  FUtil.configurePlatform({
    getEnv: () => {
      const env = assertCliEnvEnabled(getCliEnv());
      if (env === 'production') return 'prod';
      return env;
    },
    getAuthorization: () => {
      const auth = getCurrentAuth();
      return auth?.authorization || (!auth?.cookie && auth?.token ? `Bearer ${auth.token}` : undefined);
    },
    getHeaders: () => {
      const auth = getCurrentAuth();
      return auth?.cookie ? { Cookie: auth.cookie } : undefined;
    },
    getUserId: () => {
      const auth = getCurrentAuth();
      return Number(auth?.userId || -1);
    },
    onAuthError: ({ kind, result }) => {
      throw cliError(
        kind === 'unauthorized' ? I18N_KEYS.cli_login_required : I18N_KEYS.cli_account_abnormal,
        {
          code: kind === 'unauthorized' ? 2 : 4,
          hint: kind === 'unauthorized' ? 'freelog-cli login' : undefined,
          details: result,
        },
      );
    },
    onApiError: ({ errCode, result }) => {
      const apiMsg =
        result && typeof result === 'object' && 'msg' in result
          ? String((result as { msg?: unknown }).msg || '')
          : '';
      throw apiMsg
        ? new CliError(apiMsg, {
            code: errCode === 30 ? 2 : 4,
            hint: errCode === 30 ? 'freelog-cli login' : undefined,
            details: result,
          })
        : cliError(I18N_KEYS.cli_api_failed, {
            code: errCode === 30 ? 2 : 4,
            hint: errCode === 30 ? 'freelog-cli login' : undefined,
            details: result,
          });
    },
  });
}

export function assertToolsLibBootstrapped(): void {
  if (!bootstrapped) {
    throw cliError(I18N_KEYS.tools_lib_not_initialized, { code: 1 });
  }
}

/** 解包 { data }（与 Console `const { data } = await FServiceAPI…` 一致） */
export function unwrapData<T>(envelope: PlatformEnvelope<T> | T): T {
  if (
    envelope !== null &&
    typeof envelope === 'object' &&
    'data' in (envelope as object) &&
    ('errCode' in (envelope as object) ||
      'errcode' in (envelope as object) ||
      'ret' in (envelope as object) ||
      'msg' in (envelope as object))
  ) {
    return (envelope as PlatformEnvelope<T>).data as T;
  }
  return envelope as T;
}
