import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError, writeJsonSuccess } from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { collectionVersionSet } from '../../services/collection/index.js';
import { collectionEnvArgs } from './common.js';

const versionSetCmd = defineCommand({
  meta: { name: 'set', description: '更新合集下一次 publish 的发布说明意图' },
  args: {
    version: { type: 'string', description: '已废弃：合集固定版本，不支持设置' },
    description: { type: 'string', description: '合集版本说明' },
    ...collectionEnvArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      if (args.version === undefined && args.description === undefined) {
        throw cliError(I18N_KEYS.collection_description_required, { code: 4 });
      }
      const collection = await collectionVersionSet({
        cwd: resolveCwd(args.cwd),
        version: args.version,
        description: args.description,
      });
      if (args.json) {
        writeJsonSuccess('collection version set', {
          description: collection.description ?? '',
        });
      } else {
        consola.success('已更新合集发布说明意图');
      }
    } catch (error) {
      handleCommandError(error, args.json, 'collection version set');
    }
  },
});

export const versionCommand = defineCommand({
  meta: { name: 'version', description: '合集发布说明意图' },
  subCommands: { set: versionSetCmd },
});
