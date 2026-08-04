import { inspect } from 'node:util';
import { consola } from 'consola';
import { applyGlobalFlags } from './env.js';
import { CliError, toExitCode } from './errors.js';

let debugEnabled = process.env.FREELOG_DEBUG === '1' || process.env.FREELOG_DEBUG === 'true';

export function applyCommandFlags(args: { test?: boolean; env?: string; debug?: boolean }): void {
  applyGlobalFlags(args);
  if (args.debug) debugEnabled = true;
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

export function handleCommandError(error: unknown, json?: boolean): never {
  const code = toExitCode(error);
  const message = error instanceof Error ? error.message : String(error);
  const hint = error instanceof CliError ? error.hint : undefined;
  const debug = isDebugEnabled() ? debugPayload(error) : undefined;

  if (json) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        code,
        message,
        hint,
        details: error instanceof CliError ? redactSensitiveValue(error.details) : undefined,
        debug,
      })}\n`,
    );
  } else {
    consola.error(message);
    if (hint) consola.info(`→ ${hint}`);
    if (debug) {
      process.stderr.write(`${inspect(debug, { depth: 8, colors: process.stderr.isTTY })}\n`);
    }
  }
  process.exit(code);
}
