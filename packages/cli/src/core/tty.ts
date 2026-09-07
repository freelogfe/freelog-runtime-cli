/** TTY 交互（inquirer 封装）：确认 / 提问。--yes 时跳过确认，但不跳过校验。 */

import { confirm as inquirerConfirm, input as inquirerInput } from '@inquirer/prompts';
import { CliError } from './errors';

/** 是否在交互终端；非 TTY 时所有问句都走各自的降级/报错路径。 */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** 是/否确认；非 TTY 直接返回默认值（不报错，供 --yes 之外的默认放行）。 */
export async function confirmQuestion(
  message: string,
  defaultYes = true,
): Promise<boolean> {
  if (!isInteractive()) {
    return defaultYes;
  }
  return inquirerConfirm({ message, default: defaultYes });
}

/** 文本提问；非 TTY 没法问，直接报错让人走参数。 */
export async function askInput(message: string): Promise<string> {
  if (!isInteractive()) {
    // i18n: cli.tty.required
    throw new CliError('请提供 --file 或 --yes', 'TTY_REQUIRED');
  }
  return inquirerInput({ message });
}

/** 写前确认：`--yes` 直接放行；非 TTY 则要求显式参数。 */
export async function confirmWrite(preview: string, yes?: boolean): Promise<string> {
  if (yes) {
    return preview;
  }
  if (!isInteractive()) {
    // i18n: cli.form.need_yes
    throw new CliError('请加 --yes 确认预览', 'FORM_NEED_YES');
  }
  const ok = await confirmQuestion(`${preview}\n确认写入？`, true);
  if (!ok) {
    // i18n: cli.form.cancelled
    throw new CliError('已取消', 'FORM_CANCELLED');
  }
  return preview;
}
