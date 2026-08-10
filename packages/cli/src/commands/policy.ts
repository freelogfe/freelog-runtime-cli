import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/project.js';
import { policyApplyFromFile, policyList, policySetStatus } from '../services/policyService.js';
import { policyInit } from '../services/scaffoldInit.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

const policyApply = defineCommand({
  meta: { name: 'apply', description: '从 --from-file 应用策略' },
  args: {
    'from-file': { type: 'string', required: true },
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const items = await policyApplyFromFile({
        cwd: resolveCwd(args.cwd),
        fromFile: args['from-file'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) {
          process.stdout.write(`${JSON.stringify({ ok: true, applied: items.length })}\n`);
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
    cwd: { type: 'string' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const policies = await policyList({ cwd });
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, policies })}\n`);
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
    policyId: { type: 'positional', required: true },
    status: { type: 'string', required: true, description: '0 | 1' },
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const status = Number(args.status);
      if (status !== 0 && status !== 1) {
        throw cliError(I18N_KEYS.status_must_be_0_or_1, { code: 4 });
      }
      await policySetStatus({
        cwd: resolveCwd(args.cwd),
        policyId: String(args.policyId),
        status,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: true, policyId: String(args.policyId), status })}\n`,
        );
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
