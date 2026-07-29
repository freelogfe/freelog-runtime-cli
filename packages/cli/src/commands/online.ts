import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyGlobalFlags } from '../core/env.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/paths.js';
import { offlineResource, onlineResource } from '../services/onlineService.js';
import { handleCommandError } from './login.js';
import { isInteractive } from '../core/tty.js';
import * as p from '@clack/prompts';

export const onlineCommand = defineCommand({
  meta: { name: 'online', description: '严格上架（须 latestVersion + 启用策略）' },
  args: {
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags({ test: args.test });
      if (!args.yes && isInteractive(args.yes)) {
        const ok = await p.confirm({ message: '确认上架？' });
        if (p.isCancel(ok) || !ok) {
          consola.info('已取消');
          process.exitCode = 0;
          return;
        }
      } else if (!args.yes && !isInteractive(args.yes)) {
        throw new CliError('非交互上架需要 --yes', { code: 4 });
      }

      const result = await onlineResource({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, already: result.already })}\n`);
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
  args: {
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags({ test: args.test });
      if (!args.yes && isInteractive(args.yes)) {
        const ok = await p.confirm({ message: '确认下架？' });
        if (p.isCancel(ok) || !ok) {
          consola.info('已取消');
          process.exitCode = 0;
          return;
        }
      } else if (!args.yes && !isInteractive(args.yes)) {
        throw new CliError('非交互下架需要 --yes', { code: 4 });
      }

      await offlineResource({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      else consola.success('已下架');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
