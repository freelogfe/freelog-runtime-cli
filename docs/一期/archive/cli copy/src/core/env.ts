import { loadProjectDefaultEnv } from './projectConfig.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

export type FreelogEnv = 'production' | 'test' | 'dev';

const API_BASE: Record<FreelogEnv, string> = {
  // 对齐 tools-lib domain.ts：prod → .freelog.cn，dev → .devfreelog.com，test → .testfreelog.com
  production: 'https://api.freelog.cn',
  dev: 'https://api.devfreelog.com',
  test: 'https://api.testfreelog.com',
};

const CONSOLE_BASE: Record<FreelogEnv, string> = {
  production: 'https://console.freelog.cn',
  dev: 'https://console.devfreelog.com',
  test: 'https://console.testfreelog.com',
};

let forcedEnv: FreelogEnv | undefined;
let envSetExplicitly = false;

/** production 发布门禁：恢复前不得移除此约束或绕过 URL 解析入口。 */
export const productionEnvDisabled = true;

function normalizeCliEnv(value: string | undefined): FreelogEnv | undefined {
  const raw = (value || '').toLowerCase();
  if (!raw) return undefined;
  if (raw === 'production' || raw === 'prod') return 'production';
  if (raw === 'test') return 'test';
  if (raw === 'dev' || raw === 'development') return 'dev';
  return undefined;
}

/** @internal 供写命令环境保护使用 */
export function normalizeCliEnvForWriteGuard(value: string | undefined): FreelogEnv | undefined {
  return normalizeCliEnv(value);
}

/** 将本进程后续 API/Console URL 使用的环境固定为 env。 */
export function setCliEnv(env: FreelogEnv): void {
  forcedEnv = env;
}

/** 本次进程是否通过 --env / --test / FREELOG_ENV 明确指定过环境 */
export function wasEnvExplicitlySet(): boolean {
  return envSetExplicitly;
}

/** 返回当前有效环境；未显式设置时默认 production，但写命令仍由显式环境门禁拦截。 */
export function getCliEnv(): FreelogEnv {
  if (forcedEnv) return forcedEnv;
  return normalizeCliEnv(process.env.FREELOG_ENV) || 'production';
}

/**
 * 在网络 URL 解析和平台写操作前统一阻断 production。
 * 保留 production 的解析能力是为了给旧配置和误输入稳定的可行动错误，绝不允许降级到其他环境。
 */
export function assertCliEnvEnabled(env: FreelogEnv = getCliEnv()): FreelogEnv {
  if (productionEnvDisabled && env === 'production') {
    throw cliError(I18N_KEYS.production_env_disabled, {
      code: 4,
      hintKey: I18N_KEYS.production_env_disabled_hint,
    });
  }
  return env;
}

/** 根据当前环境返回平台 API 根地址，并执行 production 禁用门禁。 */
export function getApiBaseURL(): string {
  return API_BASE[assertCliEnvEnabled()];
}

/** 根据环境返回 Console 根地址；用于浏览器接力，不会自动打开浏览器。 */
export function getConsoleBaseURL(env: FreelogEnv = getCliEnv()): string {
  return CONSOLE_BASE[assertCliEnvEnabled(env)];
}

/** 按 test → --env → FREELOG_ENV → 项目默认配置的优先级应用全局环境参数。 */
export function applyGlobalFlags(args: { test?: boolean; env?: string }): void {
  if (args.test) {
    setCliEnv('test');
    envSetExplicitly = true;
    return;
  }
  const env = normalizeCliEnv(args.env);
  if (env) {
    setCliEnv(env);
    envSetExplicitly = true;
    return;
  }
  if (normalizeCliEnv(process.env.FREELOG_ENV)) {
    envSetExplicitly = true;
    return;
  }
  const projectEnv = loadProjectDefaultEnv();
  if (projectEnv) {
    setCliEnv(projectEnv);
    envSetExplicitly = true;
  }
}
