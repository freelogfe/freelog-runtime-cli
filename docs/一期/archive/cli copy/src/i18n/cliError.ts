import { CliError, type ExitCode } from '../core/errors.js';
import { t, type I18nKey } from './index.js';

export function cliError(
  key: I18nKey | string,
  options: {
    code: ExitCode;
    params?: Record<string, string | number>;
    hint?: string;
    hintKey?: I18nKey | string;
    details?: unknown;
    cause?: unknown;
  },
): CliError {
  const hint =
    options.hint ??
    (options.hintKey ? t(options.hintKey, options.params) : undefined);
  return new CliError(t(key, options.params), {
    code: options.code,
    hint,
    details: { ...(options.details as object), i18nKey: key },
    cause: options.cause,
  });
}
