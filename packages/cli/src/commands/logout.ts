import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyGlobalFlags } from '../core/env.js';
import { clearAuth } from '../core/auth.js';
import { handleCommandError } from './login.js';

export const logoutCommand = defineCommand({
  meta: { name: 'logout', description: '退出登录' },
  args: {
    test: { type: 'boolean' },
    global: { type: 'boolean', alias: 'g' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags({ test: args.test });
      clearAuth(Boolean(args.global));
      if (!args.global) clearAuth(true);
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      } else {
        consola.success('已退出登录');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
