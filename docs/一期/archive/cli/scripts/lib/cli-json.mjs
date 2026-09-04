/** 解包 CLI `--json` envelope（兼容旧 flat 结构） */
export function unwrapCliJson(parsed) {
  if (
    parsed &&
    typeof parsed === 'object' &&
    parsed.schemaVersion === 1 &&
    parsed.data &&
    typeof parsed.data === 'object'
  ) {
    return {
      ...parsed.data,
      ok: parsed.ok,
      schemaVersion: parsed.schemaVersion,
      command: parsed.command,
      warnings: parsed.warnings,
      meta: parsed.meta,
      error: parsed.error,
    };
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    parsed.schemaVersion === 1 &&
    parsed.error &&
    typeof parsed.error === 'object'
  ) {
    const err = parsed.error;
    const details =
      err.details && typeof err.details === 'object' && !Array.isArray(err.details)
        ? err.details
        : {};
    return {
      ...details,
      ok: false,
      schemaVersion: parsed.schemaVersion,
      command: parsed.command,
      code: err.code,
      message: err.message,
      hint: err.hint,
      error: err,
      meta: parsed.meta,
      warnings: parsed.warnings,
    };
  }
  return parsed;
}

export function parseCliJson(stdout) {
  const start = stdout.indexOf('{');
  if (start < 0) throw new Error(`无 JSON 输出: ${stdout.slice(0, 200)}`);
  return unwrapCliJson(JSON.parse(stdout.slice(start)));
}

export function cliErrorCode(parsed) {
  if (!parsed || typeof parsed !== 'object') return undefined;
  if (parsed.error && typeof parsed.error.code === 'number') return parsed.error.code;
  if (typeof parsed.code === 'number') return parsed.code;
  return undefined;
}
