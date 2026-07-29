import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyGlobalFlags } from '../core/env.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/paths.js';
import { createResource } from '../services/resourceService.js';
import { createFromDir } from '../services/fromDirService.js';
import { assertResourceTypeCode } from '../services/typeService.js';
import { handleCommandError } from './login.js';

export const createCommand = defineCommand({
  meta: { name: 'create', description: '创建平台资源壳并写回 owner' },
  args: {
    title: { type: 'string', description: '资源标题（--from-dir 时可选）' },
    type: { type: 'string', description: 'resourceTypeCode' },
    name: { type: 'string', description: '资源唯一名 username/name' },
    'type-name': { type: 'string', description: '自定义类型名（可选）' },
    'from-dir': {
      type: 'string',
      description: '从扁平目录批量创建（最多 20 文件）；可传路径，缺省为 cwd',
    },
    'title-prefix': { type: 'string', description: '--from-dir 时标题前缀' },
    cwd: { type: 'string' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags({ test: args.test });
      if (!args.type) throw new CliError('缺少 --type <resourceTypeCode>', { code: 4 });

      const cwd = resolveCwd(args.cwd);

      if (args['from-dir'] !== undefined) {
        // boolean true when flag without value in some CLIs; treat empty/true as cwd
        const fromDirRaw = args['from-dir'];
        const dir =
          !fromDirRaw || fromDirRaw === 'true' ? cwd : resolveCwd(String(fromDirRaw));

        await assertResourceTypeCode(args.type);
        const created = await createFromDir({
          dir,
          typeCode: args.type,
          titlePrefix: args['title-prefix'],
          cwd,
          yes: args.yes,
        });

        if (args.json) {
          process.stdout.write(`${JSON.stringify({ ok: true, created })}\n`);
        } else {
          consola.success(`已从目录创建 ${created.length} 个资源`);
          for (const item of created) {
            consola.info(`${item.subdir}  ${item.resourceId}  ${item.resourceName}`);
          }
        }
        return;
      }

      if (!args.title) throw new CliError('缺少 --title', { code: 4 });

      const data = await createResource({
        cwd,
        title: args.title,
        typeCode: args.type,
        name: args.name,
        resourceTypeName: args['type-name'],
      });

      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, resource: data })}\n`);
      } else {
        consola.success(`已创建资源 ${data.resourceId}（${data.resourceName}）`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
