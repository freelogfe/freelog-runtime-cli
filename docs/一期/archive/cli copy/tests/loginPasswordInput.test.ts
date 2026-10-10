import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { resolveLoginPassword } from '../src/core/passwordInput.js';
import { loginCommand } from '../src/commands/login.js';

function stdinFrom(value: string, isTTY = false): Readable & { isTTY?: boolean } {
  const stream = Readable.from([value]) as Readable & { isTTY?: boolean };
  stream.isTTY = isTTY;
  return stream;
}

describe('login password input', () => {
  it('exposes --password-stdin on the login command', () => {
    expect(loginCommand.args?.['password-stdin']).toMatchObject({ type: 'boolean' });
  });

  it('reads a piped password without retaining the final line ending', async () => {
    await expect(
      resolveLoginPassword(
        { passwordStdin: true },
        stdinFrom('  password with spaces  \r\n'),
      ),
    ).resolves.toBe('  password with spaces  ');
  });

  it('rejects --password together with --password-stdin before reading stdin', async () => {
    await expect(
      resolveLoginPassword(
        { password: 'argv-secret', passwordStdin: true },
        stdinFrom('stdin-secret\n'),
      ),
    ).rejects.toMatchObject({ code: 4 });
  });

  it('rejects --password-stdin on a TTY to avoid a hidden blocking prompt', async () => {
    await expect(
      resolveLoginPassword({ passwordStdin: true }, stdinFrom('', true)),
    ).rejects.toMatchObject({ code: 4 });
  });

  it('rejects empty and oversized stdin values', async () => {
    await expect(
      resolveLoginPassword({ passwordStdin: true }, stdinFrom('\n')),
    ).rejects.toMatchObject({ code: 4 });
    await expect(
      resolveLoginPassword({ passwordStdin: true }, stdinFrom('x'.repeat(16_385))),
    ).rejects.toMatchObject({ code: 4 });
  });
});
