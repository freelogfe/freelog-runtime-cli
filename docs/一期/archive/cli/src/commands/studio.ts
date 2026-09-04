import { defineCommand } from 'citty';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { cliEnvArgs } from '../core/cliArgs.js';
import { runStudioShell } from '../services/interactive/studioShell.js';

export const studioCommand = defineCommand({
  meta: {
    name: 'studio',
    description: '多账号工作区（10：凭据不落盘，子工程落盘；须 TTY）',
  },
  args: {
    ...cliEnvArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      await runStudioShell();
    } catch (error) {
      handleCommandError(error);
    }
  },
});
