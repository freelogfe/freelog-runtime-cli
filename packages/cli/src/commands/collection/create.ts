import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import { createCollection } from '../../services/collection/index.js';
import { collectionCommonArgs } from './common.js';

export const createCmd = defineCommand({
  meta: { name: 'create', description: '创建合集壳（subjectType=4）' },
  args: {
    title: { type: 'string', description: '合集标题' },
    type: { type: 'string', description: '合集类型 code' },
    'type-name': { type: 'string', description: '自定义类型名（可选）' },
    name: { type: 'string', description: '短授权标识（不含 username/）' },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const data = await createCollection({
        cwd: resolveCwd(args.cwd),
        title: args.title,
        typeCode: args.type,
        resourceTypeName: args['type-name'],
        name: args.name,
      });
      if (args.json) writeJsonSuccess('collection create', { collection: data });
      else consola.success(`已创建合集 ${data.resourceId}（${data.resourceName}）`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
