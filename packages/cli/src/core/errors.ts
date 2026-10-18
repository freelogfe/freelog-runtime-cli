/**
 * CliError：中文 message + 机器可读 code（--json 时输出 {code,message}）。
 * 错误文案索引见 docs/一期/产品方案/使用/09-常见情况与报错.md。
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

/** 未知异常可能带 HTTP 凭据；只保留已受控业务错误，不读取其它异常的任何字段。 */
export function normalizeCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  return new CliError(
    // i18n: cli.error.unexpected
    '命令执行失败；如涉及写入，请先核对实际结果，勿重复执行。',
    'CLI_UNEXPECTED_ERROR',
  );
}

/** 命令执行及 bootstrap 共用的安全出口；不重试、清状态或序列化原始异常。 */
export function reportCliError(
  error: unknown,
  argv: readonly string[],
  output: { writeOut?: (text: string) => void; writeErr?: (text: string) => void } = {},
): 1 {
  const text = `${formatCliError(normalizeCliError(error), argv)}\n`;
  if (argv.includes('--json')) {
    (output.writeOut ?? ((value: string) => { process.stdout.write(value); }))(text);
  } else {
    (output.writeErr ?? ((value: string) => { process.stderr.write(value); }))(text);
  }
  return 1;
}
