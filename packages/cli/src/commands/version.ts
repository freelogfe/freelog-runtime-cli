import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyGlobalFlags } from '../core/env.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/paths.js';
import { editReleasedVersion } from '../services/versionEditService.js';
import { handleCommandError } from './login.js';

const editCommand = defineCommand({
  meta: { name: 'edit', description: '改已发行版元数据（不换文件、不升版本）' },
  args: {
    version: { type: 'string', description: '已存在的正式版本号' },
    description: { type: 'string' },
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
      if (!args.version) throw new CliError('缺少 --version', { code: 4 });
      const result = await editReleasedVersion({
        cwd: resolveCwd(args.cwd),
        version: args.version,
        description: args.description,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      else consola.success(`已更新正式版 ${result.version} 元数据`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const versionCommand = defineCommand({
  meta: { name: 'version', description: '已发行版本元数据' },
  subCommands: {
    edit: editCommand,
  },
});
