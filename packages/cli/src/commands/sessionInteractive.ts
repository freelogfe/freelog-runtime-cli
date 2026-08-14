import { defineCommand } from 'citty';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { cliEnvArgs } from '../core/cliArgs.js';
import { runSessionShell } from '../services/interactive/sessionShell.js';

export const sessionInteractiveCommand = defineCommand({
  meta: {
    name: 'session',
    description: '交互会话（11：凭据与 state 均不落盘；须 TTY）',
  },
  args: {
    ...cliEnvArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      await runSessionShell();
    } catch (error) {
      handleCommandError(error);
    }
  },
});
