import { syncShimEnv } from '../platform/shim-browser.js';

export type FreelogEnv = 'production' | 'test';

const API_BASE: Record<FreelogEnv, string> = {
  // 对齐 tools-lib domain.ts：prod → .freelog.cn，test → .testfreelog.com
  production: 'https://api.freelog.cn',
  test: 'https://api.testfreelog.com',
};

let forcedEnv: FreelogEnv | undefined;

export function setCliEnv(env: FreelogEnv): void {
  forcedEnv = env;
  syncShimEnv(env);
}

export function getCliEnv(): FreelogEnv {
  if (forcedEnv) return forcedEnv;
  const raw = (process.env.FREELOG_ENV || '').toLowerCase();
  if (raw === 'test' || raw === 'development' || raw === 'dev') return 'test';
  return 'production';
}

export function getApiBaseURL(): string {
  return API_BASE[getCliEnv()];
}

export function applyGlobalFlags(args: { test?: boolean; env?: string }): void {
  if (args.test) {
    setCliEnv('test');
    return;
  }
  if (args.env === 'test' || args.env === 'production') {
    setCliEnv(args.env);
  }
}
