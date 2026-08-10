import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { generateBashCompletion, generateZshCompletion } from '../core/cliCatalog.js';

const bashCmd = defineCommand({
  meta: { name: 'bash', description: '输出 bash completion 脚本' },
  args: {},
  run() {
    process.stdout.write(generateBashCompletion());
  },
});

const zshCmd = defineCommand({
  meta: { name: 'zsh', description: '输出 zsh completion 脚本' },
  args: {},
  run() {
    process.stdout.write(generateZshCompletion());
  },
});

export const completionCommand = defineCommand({
  meta: { name: 'completion', description: 'Shell 补全（eval "$(freelog-cli completion bash)"）' },
  subCommands: {
    bash: bashCmd,
    zsh: zshCmd,
  },
  args: {
    test: { type: 'boolean' },
    env: { type: 'string' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      consola.info('请指定 shell：freelog-cli completion bash | zsh');
      process.exitCode = 4;
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
