import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { clearAuth } from '../core/auth.js';

export const logoutCommand = defineCommand({
  meta: { name: 'logout', description: '退出登录' },
  args: {
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      clearAuth(true);
      if (process.env.FREELOG_AUTH_PATH_WORKSPACE) clearAuth(false);
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
