import { getCliEnv } from './env.js';
import { CliError, toExitCode } from './errors.js';

function redactSensitiveValue(value: unknown): unknown {
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

export const JSON_SCHEMA_VERSION = 1;

export interface JsonEnvelopeMeta {
  env: string;
}

export interface JsonResultEnvelope {
  schemaVersion: typeof JSON_SCHEMA_VERSION;
  ok: boolean;
  command: string;
  data: Record<string, unknown>;
  warnings: string[];
  meta: JsonEnvelopeMeta;
}

export interface JsonErrorBody {
  code: number;
  message: string;
  hint?: string;
  details?: unknown;
  debug?: Record<string, unknown>;
}

export interface JsonErrorEnvelope {
  schemaVersion: typeof JSON_SCHEMA_VERSION;
  ok: false;
  command: string;
  error: JsonErrorBody;
  warnings: string[];
  meta: JsonEnvelopeMeta;
}

function buildMeta(): JsonEnvelopeMeta {
  return { env: getCliEnv() };
}

function toJsonData(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { value: data };
}

export function formatJsonSuccess(
  command: string,
  data: unknown,
  opts?: { warnings?: string[]; ok?: boolean },
): JsonResultEnvelope {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    ok: opts?.ok !== false,
    command,
    data: toJsonData(data),
    warnings: opts?.warnings ?? [],
    meta: buildMeta(),
  };
}

export function formatJsonFailure(
  command: string,
  error: unknown,
  opts?: { debug?: Record<string, unknown>; warnings?: string[] },
): JsonErrorEnvelope {
  const code = toExitCode(error);
  const message = error instanceof Error ? error.message : String(error);
  const hint = error instanceof CliError ? error.hint : undefined;
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    ok: false,
    command,
    error: {
      code,
      message,
      hint,
      details: error instanceof CliError ? redactSensitiveValue(error.details) : undefined,
      debug: opts?.debug,
    },
    warnings: opts?.warnings ?? [],
    meta: buildMeta(),
  };
}

export function writeJsonSuccess(
  command: string,
  data: unknown,
  opts?: { warnings?: string[]; ok?: boolean },
): void {
  process.stdout.write(`${JSON.stringify(formatJsonSuccess(command, data, opts))}\n`);
}

export function writeJsonFailure(
  command: string,
  error: unknown,
  opts?: { debug?: Record<string, unknown>; warnings?: string[] },
): void {
  process.stdout.write(`${JSON.stringify(formatJsonFailure(command, error, opts))}\n`);
}

/** 机器可读结果解包（兼容 envelope 与旧 flat 结构） */
export function unwrapCliJson(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }
  const row = parsed as Record<string, unknown>;
  if (
    row.schemaVersion === JSON_SCHEMA_VERSION &&
    row.data &&
    typeof row.data === 'object' &&
    !Array.isArray(row.data)
  ) {
    return {
      ...(row.data as Record<string, unknown>),
      ok: row.ok,
      schemaVersion: row.schemaVersion,
      command: row.command,
      warnings: row.warnings,
      meta: row.meta,
      error: row.error,
    };
  }
  return row;
}
