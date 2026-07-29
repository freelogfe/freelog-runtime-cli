import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyGlobalFlags } from '../core/env.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/paths.js';
import { loadVersionConfig, saveVersionConfig } from '../config/read.js';
import { ensureSynced } from '../services/syncService.js';
import { assertSemverLike } from '../services/validation.js';
import { handleCommandError } from './login.js';

export const updateVersionCommand = defineCommand({
  meta: { name: 'updateVersion', description: '写本地版本意图（不调平台）' },
  args: {
    version: { type: 'string' },
    description: { type: 'string' },
    filePath: { type: 'string' },
    runtime: { type: 'string', description: '0.4 | 0.5' },
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags({ test: args.test });
      const cwd = resolveCwd(args.cwd);
      const ctx = await ensureSynced({ cwd, noAutoPull: args['no-auto-pull'] });
      const { data } = loadVersionConfig(cwd);

      if (args.version) {
        assertSemverLike(args.version);
        data.version = args.version;
      }
      if (args.description !== undefined) data.description = args.description;
      if (args.filePath) data.filePath = args.filePath;
      if (args.runtime) {
        if (args.runtime !== '0.4' && args.runtime !== '0.5') {
          throw new CliError('--runtime 仅 0.4|0.5', { code: 4 });
        }
        data.runtimeVersion = args.runtime;
      }
      data.resourceId = ctx.resource.resourceId || data.resourceId;
      data.userId = ctx.resource.userId;
      data.username = ctx.resource.username;

      if (!data.version || !data.filePath) {
        throw new CliError('version 与 filePath 必填', { code: 4 });
      }
      assertSemverLike(data.version);

      saveVersionConfig(data, cwd);
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, version: data })}\n`);
      } else {
        consola.success(`已更新本地版本意图 ${data.version}`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
