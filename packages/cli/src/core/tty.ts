import { confirm as inquirerConfirm, input as inquirerInput } from '@inquirer/prompts';
import { CliError } from './errors';

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function confirmQuestion(
  message: string,
  defaultYes = true,
): Promise<boolean> {
  if (!isInteractive()) {
    return defaultYes;
  }
  return inquirerConfirm({ message, default: defaultYes });
}

export async function askInput(message: string): Promise<string> {
  if (!isInteractive()) {
    // i18n: cli.tty.required
    throw new CliError('请提供 --file 或 --yes', 'TTY_REQUIRED');
  }
  return inquirerInput({ message });
}

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
