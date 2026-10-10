import { runCommand } from 'citty';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { completionCommand } from '../src/commands/completion.js';

describe('completion command dispatch', () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('keeps a successful shell subcommand successful after the parent command runs', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCommand(completionCommand, { rawArgs: ['bash'] });

    expect(write).toHaveBeenCalledWith(expect.stringContaining('complete -F _freelog_cli'));
    expect(process.exitCode).not.toBe(4);
  });
});
