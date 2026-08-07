import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { collectionUpdate } from '../../services/collection/index.js';
import { collectionCommonArgs } from './common.js';

export const updateCmd = defineCommand({
  meta: { name: 'update', description: '更新合集 listing / 展示设置' },
  args: {
    title: { type: 'string' },
    intro: { type: 'string' },
    cover: { type: 'string' },
    tags: { type: 'string', description: '逗号分隔' },
    'display-sort': { type: 'string', description: 'asc|desc' },
    'display-title': { type: 'string', description: 'rtitle|sn|empty|custom' },
    'display-no': { type: 'string', description: 'show|hide' },
    'display-image': { type: 'string', description: 'show|hide' },
    'display-descr': { type: 'string', description: 'show|hide' },
    'display-view': { type: 'string', description: 'list|card' },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const hasDisplay =
        args['display-sort'] ||
        args['display-title'] ||
        args['display-no'] ||
        args['display-image'] ||
        args['display-descr'] ||
        args['display-view'];
      if (!args.title && args.intro === undefined && !args.cover && !args.tags && !hasDisplay) {
        throw cliError(I18N_KEYS.collection_listing_or_display_required, { code: 4 });
      }
      const data = await collectionUpdate({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
        title: args.title,
        intro: args.intro,
        cover: args.cover,
        tags: args.tags ? args.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        displaySort: args['display-sort'],
        displayTitle: args['display-title'],
        displayNo: args['display-no'],
        displayImage: args['display-image'],
        displayDescr: args['display-descr'],
        displayView: args['display-view'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, collection: data })}\n`);
      else consola.success('已更新合集');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
