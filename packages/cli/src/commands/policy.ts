import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyGlobalFlags } from '../core/env.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/paths.js';
import { policyAddFromFile, policyList, policySetStatus } from '../services/policyService.js';
import { handleCommandError } from './login.js';

const policyAdd = defineCommand({
  meta: { name: 'add', description: '从 --from-file 添加策略' },
  args: {
    'from-file': { type: 'string', required: true },
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags(args);
      const items = await policyAddFromFile({
        cwd: resolveCwd(args.cwd),
        fromFile: args['from-file'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, added: items.length })}\n`);
      } else {
        consola.success(`已添加 ${items.length} 条策略`);
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
    enable: { type: 'string', description: '启用策略：--enable <policyId>' },
    disable: { type: 'string', description: '停用策略：--disable <policyId>' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags(args);
      const cwd = resolveCwd(args.cwd);
      if (args.enable) {
        await policySetStatus({ cwd, policyId: args.enable, status: 1 });
        if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, policyId: args.enable, status: 1 })}\n`);
        else consola.success(`已启用 ${args.enable}`);
        return;
      }
      if (args.disable) {
        await policySetStatus({ cwd, policyId: args.disable, status: 0 });
        if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, policyId: args.disable, status: 0 })}\n`);
        else consola.success(`已停用 ${args.disable}`);
        return;
      }
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

export const policyCommand = defineCommand({
  meta: { name: 'policy', description: '策略管理' },
  subCommands: {
    add: policyAdd,
    list: policyListCmd,
  },
  run() {
    throw new CliError('请使用 policy add | policy list', { code: 4 });
  },
});
