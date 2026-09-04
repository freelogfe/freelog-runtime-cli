import { inspect } from 'node:util';
import { consola } from 'consola';
import { formatAuthContextLine, resolveCurrentAuth, setAuthResolveCwd } from './auth.js';
import {
  applyGlobalFlags,
  assertCliEnvEnabled,
  getCliEnv,
  normalizeCliEnvForWriteGuard,
  wasEnvExplicitlySet,
} from './env.js';
import { CliError, toExitCode } from './errors.js';
import { writeJsonFailure } from './jsonEnvelope.js';

export { writeJsonSuccess, unwrapCliJson } from './jsonEnvelope.js';

let debugEnabled = process.env.FREELOG_DEBUG === '1' || process.env.FREELOG_DEBUG === 'true';

function assertExplicitEnvForNonInteractive(args?: { test?: boolean; env?: string }): void {
  if (process.env.VITEST === 'true') return;
  assertCliEnvEnabled();
  if (process.stdin.isTTY) return;
  if (wasEnvExplicitlySet()) return;
  if (args?.test || normalizeCliEnvForWriteGuard(args?.env)) return;
  if (getCliEnv() !== 'production') return;
  throw new CliError(
    '非交互环境未指定 API 环境（当前默认 production，易误操作生产）',
    {
      code: 4,
      hint: 'CI/脚本请传 --env dev|test、--test，或设置 FREELOG_ENV',
    },
  );
}

/** 写 API / 改平台状态的服务入口调用（不依赖命令行 args） */
export function assertExplicitEnvForWriteOperation(): void {
  assertExplicitEnvForNonInteractive();
}

export function applyCommandFlags(args: {
  test?: boolean;
  env?: string;
  debug?: boolean;
  cwd?: string;
}): void {
  applyGlobalFlags(args);
  if (args.debug) debugEnabled = true;
  setAuthResolveCwd(args.cwd);
}

function shouldShowAuthContext(args?: { json?: boolean; yes?: boolean }): boolean {
  if (process.env.VITEST === 'true') return false;
  if (args?.json) return false;
  if (!process.stdin.isTTY) return false;
  return true;
}

/** 写操作前在交互终端提示当前登录账号，避免多账号误操作。 */
export function logAuthContextIfInteractive(args?: { json?: boolean; yes?: boolean }): void {
  if (!shouldShowAuthContext(args)) return;
  const resolved = resolveCurrentAuth();
  if (!resolved) return;
  consola.info(formatAuthContextLine(resolved));
}

/** 会改平台或本地项目状态的命令：CI 须显式 --env / --test / FREELOG_ENV 或项目 .freelog/config.json */
export function applyWriteCommandFlags(args: {
  test?: boolean;
  env?: string;
  debug?: boolean;
  json?: boolean;
  yes?: boolean;
  cwd?: string;
}): void {
  applyCommandFlags(args);
  assertExplicitEnvForNonInteractive(args);
  logAuthContextIfInteractive(args);
}

export function isDebugEnabled(): boolean {
  return debugEnabled;
}

export function redactSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveValue);
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/token|password|cookie|authorization/i.test(key)) {
      output[key] = '[redacted]';
    } else {
      output[key] = redactSensitiveValue(item);
    }
  }
  return output;
}

function debugPayload(error: unknown): Record<string, unknown> {
  if (error instanceof CliError) {
    return {
      name: error.name,
      stack: error.stack,
      details: redactSensitiveValue(error.details),
      cause: redactSensitiveValue(error.cause),
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      stack: error.stack,
      cause: redactSensitiveValue(error.cause),
    };
  }
  return { value: redactSensitiveValue(error) };
}

export function handleCommandError(error: unknown, json?: boolean, command?: string): never {
  const code = toExitCode(error);
  const message = error instanceof Error ? error.message : String(error);
  const hint = error instanceof CliError ? error.hint : undefined;
  const debug = isDebugEnabled() ? debugPayload(error) : undefined;

  if (json) {
    writeJsonFailure(command ?? 'unknown', error, { debug });
  } else {
    consola.error(message);
    if (hint) consola.info(`→ ${hint}`);
    if (debug) {
      process.stderr.write(`${inspect(debug, { depth: 8, colors: process.stderr.isTTY })}\n`);
    }
  }
  process.exit(code);
}
