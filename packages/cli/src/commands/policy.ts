import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { policyApplyFromFile, policyList, policySetStatus } from '../services/policyService.js';
import { policyInit } from '../services/scaffoldInit.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

import { cliReadCommandArgs, cliWriteCommandArgs } from '../core/cliArgs.js';
import {
  finalizeSessionCommand,
  resolveSessionMaintenanceStore,
} from '../services/store/index.js';

const policyApply = defineCommand({
  meta: { name: 'apply', description: '从 --from-file 应用策略' },
  args: {
    'from-file': { type: 'string', required: true, description: '策略 JSON 文件路径' },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const store = resolveSessionMaintenanceStore({
        cwd: resolveCwd(args.cwd),
        session: args.session,
        'resource-id': args['resource-id'],
      });
      const items = await policyApplyFromFile({
        store,
        fromFile: args['from-file'],
        noAutoPull: args['no-auto-pull'],
      });
      const payload = finalizeSessionCommand({
        store,
        exportProject: args['export-project'],
        result: { applied: items.length },
      });
      if (args.json) {
        writeJsonSuccess('policy apply', payload);
      } else {
        consola.success(`已应用 ${items.length} 条策略`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policyListCmd = defineCommand({
  meta: { name: 'list', description: '列出策略' },
  args: {
    ...cliReadCommandArgs,
    session: cliWriteCommandArgs.session,
    'resource-id': cliWriteCommandArgs['resource-id'],
    'export-project': cliWriteCommandArgs['export-project'],
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const store = resolveSessionMaintenanceStore({
        cwd: resolveCwd(args.cwd),
        session: args.session,
        'resource-id': args['resource-id'],
      });
      const policies = await policyList({ store });
      const payload = finalizeSessionCommand({
        store,
        exportProject: args['export-project'],
        result: { policies },
      });
      if (args.json) {
        writeJsonSuccess('policy list', payload);
      } else {
        for (const p of policies) {
          consola.info(`${p.policyId || '-'}  ${p.policyName || '-'}  status=${p.status}`);
        }
        if (!policies.length) consola.warn('无策略');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policySetCmd = defineCommand({
  meta: { name: 'set', description: '启用或停用策略' },
  args: {
    policyId: { type: 'positional', required: true, description: '策略 ID' },
    status: { type: 'string', required: true, description: '0=停用 | 1=启用' },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const status = Number(args.status);
      if (status !== 0 && status !== 1) {
        throw cliError(I18N_KEYS.status_must_be_0_or_1, { code: 4 });
      }
      const store = resolveSessionMaintenanceStore({
        cwd: resolveCwd(args.cwd),
        session: args.session,
        'resource-id': args['resource-id'],
      });
      await policySetStatus({
        store,
        policyId: String(args.policyId),
        status,
        noAutoPull: args['no-auto-pull'],
      });
      const payload = finalizeSessionCommand({
        store,
        exportProject: args['export-project'],
        result: { policyId: String(args.policyId), status },
      });
      if (args.json) {
        writeJsonSuccess('policy set', payload);
      } else {
        consola.success(`${status === 1 ? '已启用' : '已停用'} ${String(args.policyId)}`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const policyCommand = defineCommand({
  meta: { name: 'policy', description: '策略管理' },
  subCommands: {
    init: policyInit,
    apply: policyApply,
    list: policyListCmd,
    set: policySetCmd,
  },
});
