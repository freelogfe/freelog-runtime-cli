import { defineCommand } from 'citty';
import { consola } from 'consola';
import {
  applyCommandFlags,
  applyWriteCommandFlags,
  handleCommandError,
  writeJsonSuccess,
} from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  collectionPolicyApply,
  collectionPolicyList,
  collectionPolicySetStatus,
} from '../../services/collection/index.js';
import { collectionCommonArgs, collectionEnvArgs } from './common.js';

const policyApplyCmd = defineCommand({
  meta: { name: 'apply', description: '合集策略（同 policy.json）' },
  args: {
    'from-file': { type: 'string', required: true },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const items = await collectionPolicyApply({
        cwd: resolveCwd(args.cwd),
        fromFile: args['from-file'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) writeJsonSuccess('collection policy', { applied: items.length });
      else consola.success(`已应用 ${items.length} 条策略`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policyListCmd = defineCommand({
  meta: { name: 'list', description: '列出合集策略' },
  args: {
    ...collectionEnvArgs,
    'no-auto-pull': { type: 'boolean' as const },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const policies = await collectionPolicyList({ cwd });
      if (args.json) writeJsonSuccess('collection policy', { policies });
      else {
        for (const pol of policies) {
          consola.info(`${pol.policyId || '-'}  ${pol.policyName || '-'}  status=${pol.status}`);
        }
        if (!policies.length) consola.warn('无策略');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policySetCmd = defineCommand({
  meta: { name: 'set', description: '启用或停用合集策略' },
  args: {
    policyId: { type: 'positional', required: true },
    status: { type: 'string', required: true, description: '0 | 1' },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const status = Number(args.status);
      if (status !== 0 && status !== 1) {
        throw cliError(I18N_KEYS.status_must_be_0_or_1, { code: 4 });
      }
      await collectionPolicySetStatus({
        cwd: resolveCwd(args.cwd),
        policyId: String(args.policyId),
        status,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) {
        writeJsonSuccess('collection policy', { policyId: String(args.policyId), status });
      } else {
        consola.success(`${status === 1 ? '已启用' : '已停用'} ${String(args.policyId)}`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const policyCommand = defineCommand({
  meta: { name: 'policy', description: '合集策略' },
  subCommands: { apply: policyApplyCmd, list: policyListCmd, set: policySetCmd },
});
