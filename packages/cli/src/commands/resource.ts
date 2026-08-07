import path from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { isInteractive } from '../core/tty.js';
import { createFromDir } from '../services/batch/index.js';
import { runBatchImportWizard } from '../services/batchImportWizard.js';
import { assertResourceTypeCode } from '../services/typeService.js';

const importDirCommand = defineCommand({
  meta: {
    name: 'import-dir',
    description: '把目录内文件发布成多个独立资源',
  },
  args: {
    dir: { type: 'positional', required: true, description: '文件目录' },
    'resource-type': { type: 'string', description: 'resourceTypeCode；也可写在 --config defaults.resourceTypeCode' },
    'resource-type-name': { type: 'string', description: '自定义资源类型名（可选）' },
    'title-prefix': { type: 'string', description: '资源标题前缀' },
    config: { type: 'string', description: 'freelog.batch.json/yaml；默认自动发现目录内同名文件' },
    cwd: { type: 'string' },
    yes: { type: 'boolean', alias: 'y' },
    'strict-batch-limit': {
      type: 'boolean',
      description: '与 Console UI 一致：单次最多 20 个文件，超限报错（默认自动分 batch 并 warn）',
    },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const dir = path.resolve(cwd, String(args.dir));

      if (!args['resource-type'] && isInteractive(args.yes)) {
        const batch = await runBatchImportWizard({
          cwd,
          dir: String(args.dir),
          yes: Boolean(args.yes),
        });
        if (args.json) {
          process.stdout.write(`${JSON.stringify({ ok: true, ...batch })}\n`);
        } else {
          consola.success(`已从目录导入 ${batch.createdCount} 个独立资源`);
          for (const item of batch.items) {
            consola.info(`${item.subdir}  ${item.resourceId}  ${item.resourceName}`);
          }
        }
        return;
      }

      if (args['resource-type']) await assertResourceTypeCode(args['resource-type']);
      const created = await createFromDir({
        dir,
        typeCode: args['resource-type'],
        resourceTypeName: args['resource-type-name'],
        titlePrefix: args['title-prefix'],
        configFile: args.config,
        cwd,
        yes: Boolean(args.yes),
        strictBatchLimit: Boolean(args['strict-batch-limit']),
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
