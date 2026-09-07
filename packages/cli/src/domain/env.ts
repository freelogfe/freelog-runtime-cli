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

export function applyCliEnv(input: {
  flag?: string;
  env?: NodeJS.ProcessEnv;
} = {}): FreelogEnv {
  activeEnv = resolveEnv(input);
  return activeEnv;
}

export function getEnv(): FreelogEnv {
  return activeEnv;
}

export function resetEnvForTests(): void {
  activeEnv = 'prod';
}

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
