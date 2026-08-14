import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { cliEnvArgs, cliOutputArgs } from '../core/cliArgs.js';
import { authScopeLabel, clearGlobalAuth, clearResolvedAuth, resolveCurrentAuth } from '../core/auth.js';
import { resolveCwd } from '../config/project.js';

export const logoutCommand = defineCommand({
  meta: { name: 'logout', description: '退出登录' },
  args: {
    ...cliEnvArgs,
    json: cliOutputArgs.json,
    debug: cliOutputArgs.debug,
    global: { type: 'boolean', alias: 'g', description: '仅清除全局凭据 ~/.freelog-auth' },
    cwd: { type: 'string', description: '解析工作区凭据的起点目录，默认当前目录' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const before = resolveCurrentAuth(cwd);
      const cleared = args.global ? clearGlobalAuth() : clearResolvedAuth(cwd);
      if (args.json) {
        writeJsonSuccess('logout', { cleared, scope: args.global ? 'global' : before?.scope ?? 'resolved' });
      } else if (cleared) {
        consola.success(
          args.global
            ? `已清除${authScopeLabel('global')}`
            : before?.scope === 'ephemeral'
              ? '已清除临时会话凭据（未写磁盘）'
              : '已退出登录（当前上下文凭据）',
        );
      } else {
        consola.warn('没有可清除的登录凭据');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
