import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { cliWriteCommandArgs } from '../core/cliArgs.js';
import { createResource } from '../services/resourceService.js';

export const createCommand = defineCommand({
  meta: { name: 'create', description: '创建平台资源壳并写回 owner' },
  args: {
    title: { type: 'string', description: '资源标题' },
    type: { type: 'string', description: 'resourceTypeCode' },
    name: { type: 'string', description: '短授权标识（不含 username/）' },
    'type-name': { type: 'string', description: '自定义类型名（可选）' },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);

      const cwd = resolveCwd(args.cwd);
      const data = await createResource({
        cwd,
        title: args.title,
        typeCode: args.type,
        name: args.name,
        resourceTypeName: args['type-name'],
      });

      if (args.json) {
        writeJsonSuccess('create', { resource: data });
      } else {
        consola.success(`已创建资源 ${data.resourceId}（${data.resourceName}）`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
