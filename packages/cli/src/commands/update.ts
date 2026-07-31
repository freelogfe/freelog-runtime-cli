import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyGlobalFlags } from '../core/env.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/paths.js';
import { updateListing } from '../services/resourceService.js';
import { handleCommandError } from './login.js';

export const updateCommand = defineCommand({
  meta: { name: 'update', description: '更新 listing（禁止用 status:1 当上架）' },
  args: {
    title: { type: 'string' },
    intro: { type: 'string' },
    cover: { type: 'string' },
    tags: { type: 'string', description: '逗号分隔 tags' },
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
      if (!args.title && args.intro === undefined && !args.cover && !args.tags) {
        throw new CliError('请至少提供 --title/--intro/--cover/--tags 之一', { code: 4 });
      }
      const data = await updateListing({
        cwd: resolveCwd(args.cwd),
        title: args.title,
        intro: args.intro,
        cover: args.cover,
        tags: args.tags ? args.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, resource: data })}\n`);
      else consola.success('已更新 listing');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
