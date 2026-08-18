import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

const MAX_PASSWORD_BYTES = 16 * 1024;

interface PasswordInputArgs {
  password?: string;
  passwordStdin?: boolean;
}

interface AsyncPasswordInput extends AsyncIterable<string | Uint8Array> {
  isTTY?: boolean;
}

/** Resolve login password without logging it or copying stdin data into argv. */
export async function resolveLoginPassword(
  args: PasswordInputArgs,
  stdin: AsyncPasswordInput = process.stdin,
): Promise<string | undefined> {
  if (args.password !== undefined && args.passwordStdin) {
    throw cliError(I18N_KEYS.login_password_input_conflict, { code: 4 });
  }
  if (!args.passwordStdin) return args.password;
  if (stdin.isTTY) {
    throw cliError(I18N_KEYS.login_password_stdin_tty, {
      code: 4,
      hintKey: I18N_KEYS.login_password_stdin_tty_hint,
    });
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stdin) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_PASSWORD_BYTES) {
      throw cliError(I18N_KEYS.login_password_stdin_too_large, { code: 4 });
    }
    chunks.push(buffer);
  }

  const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  if (!password || /[\r\n]/.test(password)) {
    throw cliError(I18N_KEYS.login_password_stdin_invalid, { code: 4 });
  }
  return password;
}
