export type CliErrorJson = {
  code: string;
  message: string;
};

export class CliError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }

  toJSON(): CliErrorJson {
    return serializeCliError(this);
  }
}

export function serializeCliError(error: CliError): CliErrorJson {
  return {
    code: error.code ?? 'CLI_ERROR',
    message: error.message,
  };
}

export function formatCliError(error: CliError, argv: readonly string[]): string {
  if (argv.includes('--json')) {
    return JSON.stringify(serializeCliError(error));
  }
  return error.message;
}
