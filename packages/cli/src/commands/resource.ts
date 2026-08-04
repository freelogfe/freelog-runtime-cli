import path from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/project.js';
import { createFromDir } from '../services/fromDirService.js';
import { assertResourceTypeCode } from '../services/typeService.js';

const importDirCommand = defineCommand({
  meta: {
    name: 'import-dir',
    description: '把目录内文件发布成多个独立资源',
  },
  args: {
    dir: { type: 'positional', required: true, description: '文件目录' },
    'resource-type': { type: 'string', required: true, description: 'resourceTypeCode' },
    'title-prefix': { type: 'string', description: '资源标题前缀' },
    cwd: { type: 'string' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      if (!args['resource-type']) {
        throw new CliError('缺少 --resource-type <resourceTypeCode>', { code: 4 });
      }
      const cwd = resolveCwd(args.cwd);
      const dir = path.resolve(cwd, String(args.dir));
      await assertResourceTypeCode(args['resource-type']);
      const created = await createFromDir({
        dir,
        typeCode: args['resource-type'],
        titlePrefix: args['title-prefix'],
        cwd,
        yes: args.yes,
      });

      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, created })}\n`);
      } else {
        consola.success(`已从目录导入 ${created.length} 个资源`);
        for (const item of created) {
          consola.info(`${item.subdir}  ${item.resourceId}  ${item.resourceName}`);
        }
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const resourceCommand = defineCommand({
  meta: { name: 'resource', description: '资源批量导入等资源级命令' },
  subCommands: {
    'import-dir': importDirCommand,
  },
});
