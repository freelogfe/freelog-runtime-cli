/**
 * 环境解析与 prod 门禁（全 CLI 唯一一处）。
 * 优先级：--env > FREELOG_ENV > 默认 prod（发布前 prod 被硬拦，联调必须显式 --env dev/test）。
 * 注意：tools-lib 在 Node 下空 FREELOG_ENV 会落 test，必须在这里 configurePlatform 覆盖。
 */

import { CliError } from '../core/errors';
import type { FreelogEnv } from '../local/types';

export type { FreelogEnv };

let activeEnv: FreelogEnv = 'prod';

function normalizeEnvToken(raw: string): FreelogEnv {
  const value = raw.trim().toLowerCase();
  if (value === 'prod' || value === 'production') {
    return 'prod';
  }
  if (value === 'test') {
    return 'test';
  }
  if (value === 'dev' || value === 'development') {
    return 'dev';
  }
  // i18n: cli.env.invalid
  throw new CliError('环境只能是 prod、test 或 dev', 'ENV_INVALID');
}

/**
 * 环境解析（不分 prod/test/dev 不算错，FREELOG_ENV 空串按没写处理）。
 * 优先级：--env > FREELOG_ENV > 默认 prod。
 * 为什么默认是 prod：产品规格如此（省略 = prod），发布前再叠一层 assertPlatformAllowed 硬拦。
 */
export function resolveEnv(input: {
  flag?: string;
  env?: NodeJS.ProcessEnv;
} = {}): FreelogEnv {
  const flag = input.flag;
  if (flag !== undefined && flag !== '') {
    return normalizeEnvToken(flag);
  }
  const fromProcess = (input.env ?? process.env).FREELOG_ENV;
  if (fromProcess !== undefined && fromProcess !== '') {
    return normalizeEnvToken(fromProcess);
  }
  return 'prod';
}

/** program preAction 里每跑一条命令前调用：把本次 --env 定为 activeEnv。 */
export function applyCliEnv(input: {
  flag?: string;
  env?: NodeJS.ProcessEnv;
} = {}): FreelogEnv {
  activeEnv = resolveEnv(input);
  return activeEnv;
}

/**
 * 交给 tools-lib 的 getEnv（platform/bootstrap.ts 注入）。
 * 必须显式给：tools-lib Node 下空环境会默认落 test，会造成「省略 --env 打测试环」的错觉。
 */
export function getEnv(): FreelogEnv {
  return activeEnv;
}

/** 重置 activeEnv（测试隔离用）。 */
export function resetEnvForTests(): void {
  activeEnv = 'prod';
}

/** prod 硬门禁：所有会碰平台的 domain 开头先过这一关，prod 直接拦下让显式选 dev/test。 */
export function assertPlatformAllowed(env: FreelogEnv = activeEnv): FreelogEnv {
  if (env === 'prod') {
    // i18n: cli.production_env_disabled
    throw new CliError(
      'prod 暂未开放，请用 --env test 或 --env dev',
      'PRODUCTION_ENV_DISABLED',
    );
  }
  return env;
}
