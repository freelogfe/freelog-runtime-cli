import { defineCommand } from 'citty';
import { consola } from 'consola';
import {
  applyCommandFlags,
  applyWriteCommandFlags,
  handleCommandError,
  writeJsonSuccess,
} from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import { collectionSyncProperties } from '../../services/collection/index.js';
import { collectionCommonArgs } from './common.js';

const propertiesSyncCmd = defineCommand({
  meta: {
    name: 'sync',
    description: '保存合集属性到平台（不合并目录草稿，≅ Console version_syncAllProperties）',
  },
  args: {
    ...collectionCommonArgs,
    'dry-run': { type: 'boolean', description: '输出 updateCollection 请求体，不调用 API' },
  },
  async run({ args }) {
    try {
      if (args['dry-run']) applyCommandFlags(args);
      else applyWriteCommandFlags(args);
      const result = await collectionSyncProperties({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
        dryRun: args['dry-run'],
      });
      if (args.json) writeJsonSuccess('collection properties', result);
      else consola.success(`已同步合集属性 ${result.resourceId}`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const propertiesCommand = defineCommand({
  meta: { name: 'properties', description: '合集版本属性' },
  subCommands: { sync: propertiesSyncCmd },
});
