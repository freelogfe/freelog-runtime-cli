/**
 * CliError：中文 message + 机器可读 code（--json 时输出 {code,message}）。
 * 错误文案索引见 docs/一期/产品方案/使用/06-常见情况与报错.md。
 */

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

/** 转成 --json 出口用的稳定结构：code 缺省为 CLI_ERROR。 */
export function serializeCliError(error: CliError): CliErrorJson {
  return {
    code: error.code ?? 'CLI_ERROR',
    message: error.message,
  };
}

/** 按调用形态选出口格式：--json 输出单行 JSON，其余直接给中文 message。 */
export function formatCliError(error: CliError, argv: readonly string[]): string {
  if (argv.includes('--json')) {
    return JSON.stringify(serializeCliError(error));
  }
  return error.message;
}
