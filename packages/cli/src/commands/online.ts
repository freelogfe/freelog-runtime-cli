import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { CliError } from '../core/errors.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { t } from '../i18n/index.js';
import { resolveCwd } from '../config/project.js';
import { offlineResource, onlineResource } from '../services/onlineService.js';
import { cliWriteCommandArgs } from '../core/cliArgs.js';
import { isInteractive } from '../core/tty.js';
import * as p from '@clack/prompts';

export const onlineCommand = defineCommand({
  meta: { name: 'online', description: '严格上架（须 latestVersion + 启用策略）' },
  args: cliWriteCommandArgs,
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      if (!args.yes && isInteractive(args.yes)) {
        const ok = await p.confirm({ message: '确认上架？' });
        if (p.isCancel(ok) || !ok) {
          consola.info('已取消');
          process.exitCode = 0;
          return;
        }
      } else if (!args.yes && !isInteractive(args.yes)) {
        throw cliError(I18N_KEYS.non_interactive_online_needs_yes, { code: 4 });
      }

      const result = await onlineResource({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) {
        writeJsonSuccess('online', { already: result.already });
      } else if (result.already) {
        consola.info('资源已是上架状态');
      } else {
        consola.success('已上架');
      }
    } catch (error) {
      if (error instanceof CliError && error.code === 4 && args.json) {
        const details = (error.details || {}) as Record<string, unknown>;
        process.stdout.write(
          `${JSON.stringify({
            ok: false,
            code: 4,
            error: details.error || 'ONLINE_GATE_FAILED',
            message: error.message,
            gates: details.gates,
            hint: error.hint,
          })}\n`,
        );
        process.exit(4);
      }
      handleCommandError(error, args.json);
    }
  },
});

export const offlineCommand = defineCommand({
  meta: { name: 'offline', description: '下架（status=4）' },
  args: cliWriteCommandArgs,
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      if (!args.yes && isInteractive(args.yes)) {
        consola.info(t(I18N_KEYS.remove_resource_from_auth_confirmation_title));
        const ok = await p.confirm({
          message: t(I18N_KEYS.confirm_msg_remove_resource_from_auth),
        });
        if (p.isCancel(ok) || !ok) {
          consola.info('已取消');
          process.exitCode = 0;
          return;
        }
      } else if (!args.yes && !isInteractive(args.yes)) {
        throw cliError(I18N_KEYS.non_interactive_offline_needs_yes, { code: 4 });
      }

      await offlineResource({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) writeJsonSuccess('online', {});
      else consola.success('已下架');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
