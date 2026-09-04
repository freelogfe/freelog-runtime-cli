export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5;

export class CliError extends Error {
  readonly code: ExitCode;
  readonly hint?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { code: ExitCode; hint?: string; details?: unknown; cause?: unknown },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'CliError';
    this.code = options.code;
    this.hint = options.hint;
    this.details = options.details;
  }
}

export function toExitCode(error: unknown): ExitCode {
  if (error instanceof CliError) return error.code;
  return 1;
}
