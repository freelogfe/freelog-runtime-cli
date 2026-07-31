export type FreelogEnv = 'production' | 'test' | 'dev';

const API_BASE: Record<FreelogEnv, string> = {
  // 对齐 tools-lib domain.ts：prod → .freelog.cn，dev → .devfreelog.com，test → .testfreelog.com
  production: 'https://api.freelog.cn',
  dev: 'https://api.devfreelog.com',
  test: 'https://api.testfreelog.com',
};

let forcedEnv: FreelogEnv | undefined;

function normalizeCliEnv(value: string | undefined): FreelogEnv | undefined {
  const raw = (value || '').toLowerCase();
  if (!raw) return undefined;
  if (raw === 'production' || raw === 'prod') return 'production';
  if (raw === 'test') return 'test';
  if (raw === 'dev' || raw === 'development') return 'dev';
  return undefined;
}

export function setCliEnv(env: FreelogEnv): void {
  forcedEnv = env;
}

export function getCliEnv(): FreelogEnv {
  if (forcedEnv) return forcedEnv;
  return normalizeCliEnv(process.env.FREELOG_ENV) || 'production';
}

export function getApiBaseURL(): string {
  return API_BASE[getCliEnv()];
}

export function applyGlobalFlags(args: { test?: boolean; env?: string }): void {
  if (args.test) {
    setCliEnv('test');
    return;
  }
  const env = normalizeCliEnv(args.env);
  if (env) {
    setCliEnv(env);
  }
}
