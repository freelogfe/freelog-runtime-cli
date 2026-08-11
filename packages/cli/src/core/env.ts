import { loadProjectDefaultEnv } from './projectConfig.js';

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

export function setCliEnv(env: FreelogEnv): void {
  forcedEnv = env;
}

/** 本次进程是否通过 --env / --test / FREELOG_ENV 明确指定过环境 */
export function wasEnvExplicitlySet(): boolean {
  return envSetExplicitly;
}

export function getCliEnv(): FreelogEnv {
  if (forcedEnv) return forcedEnv;
  return normalizeCliEnv(process.env.FREELOG_ENV) || 'production';
}

export function getApiBaseURL(): string {
  return API_BASE[getCliEnv()];
}

export function getConsoleBaseURL(env: FreelogEnv = getCliEnv()): string {
  return CONSOLE_BASE[env];
}

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
