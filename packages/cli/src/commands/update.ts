import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { updateListing } from '../services/resourceService.js';
import { projectStoreFromCwd } from '../services/store/index.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

import { cliWriteCommandArgs } from '../core/cliArgs.js';

export const updateCommand = defineCommand({
  meta: { name: 'update', description: '更新 listing（禁止用 status:1 当上架）' },
  args: {
    title: { type: 'string', description: '资源标题' },
    intro: { type: 'string', description: '简介（最多 200 字）' },
    cover: { type: 'string', description: '封面本地路径或 URL' },
    tags: { type: 'string', description: '逗号分隔 tags' },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      if (!args.title && args.intro === undefined && !args.cover && !args.tags) {
        throw cliError(I18N_KEYS.update_at_least_one_field, { code: 4 });
      }
      const data = await updateListing({
        store: projectStoreFromCwd(resolveCwd(args.cwd)),
        title: args.title,
        intro: args.intro,
        cover: args.cover,
        tags: args.tags ? args.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) writeJsonSuccess('update', { resource: data });
      else consola.success('已更新 listing');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
