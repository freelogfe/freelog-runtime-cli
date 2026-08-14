import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { t } from '../i18n/index.js';
import { resolveCwd, tryLoadCollectionProject } from '../config/project.js';
import { offlineResource, onlineResource } from '../services/onlineService.js';
import { cliWriteCommandArgs } from '../core/cliArgs.js';
import {
  finalizeSessionCommand,
  resolveSessionMaintenanceStore,
} from '../services/store/index.js';
import { isInteractive } from '../core/tty.js';
import * as p from '@clack/prompts';
import { ensureSynced } from '../services/sync/index.js';
import { ensureCollectionSynced } from '../services/collection/index.js';
import {
  printPreflightLines,
  summarizeOnlineGates,
} from '../services/preflightSummary.js';

export const onlineCommand = defineCommand({
  meta: { name: 'online', description: '严格上架（须 latestVersion + 启用策略）' },
  args: cliWriteCommandArgs,
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const store = resolveSessionMaintenanceStore({
        cwd: resolveCwd(args.cwd),
        session: args.session,
        'resource-id': args['resource-id'],
      });

      if (!args.yes && isInteractive(args.yes)) {
        let info;
        if (store.mode() !== 'session' && tryLoadCollectionProject(store.rootDir())) {
          const ctx = await ensureCollectionSynced({
            cwd: store.rootDir(),
            noAutoPull: args['no-auto-pull'],
          });
          info = ctx.info;
        } else {
          const ctx = await ensureSynced({ store, noAutoPull: args['no-auto-pull'] });
          info = ctx.info;
        }
        printPreflightLines(summarizeOnlineGates(info).lines);
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
        store,
        noAutoPull: args['no-auto-pull'],
      });
      const payload = finalizeSessionCommand({
        store,
        exportProject: args['export-project'],
        result: { already: result.already },
      });
      if (args.json) {
        writeJsonSuccess('online', payload);
      } else if (result.already) {
        consola.info('资源已是上架状态');
      } else {
        consola.success('已上架');
      }
    } catch (error) {
      handleCommandError(error, args.json, 'online');
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

      const store = resolveSessionMaintenanceStore({
        cwd: resolveCwd(args.cwd),
        session: args.session,
        'resource-id': args['resource-id'],
      });
      await offlineResource({
        store,
        noAutoPull: args['no-auto-pull'],
      });
      const payload = finalizeSessionCommand({
        store,
        exportProject: args['export-project'],
        result: {},
      });
      if (args.json) writeJsonSuccess('offline', payload);
      else consola.success('已下架');
    } catch (error) {
      handleCommandError(error, args.json, 'offline');
    }
  },
});
