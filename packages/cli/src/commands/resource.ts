import path from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, applyWriteCommandFlags, handleCommandError } from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { isInteractive } from '../core/tty.js';
import { createFromDir, formatBatchProgressLine } from '../services/batch/index.js';
import { runBatchImportWizard } from '../services/batchImportWizard.js';
import { searchResources } from '../services/resourceSearchService.js';
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
    'json-lines': {
      type: 'boolean',
      description: '逐行输出 NDJSON 进度（start/ok/fail/skip/done），便于 CI 解析',
    },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
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

      const jsonLines = Boolean(args['json-lines']);
      const onProgress = jsonLines
        ? (event: Parameters<typeof formatBatchProgressLine>[0]) => {
            process.stdout.write(formatBatchProgressLine(event));
          }
        : undefined;

      const created = await createFromDir({
        dir,
        typeCode: args['resource-type'],
        resourceTypeName: args['resource-type-name'],
        titlePrefix: args['title-prefix'],
        configFile: args.config,
        cwd,
        yes: Boolean(args.yes),
        strictBatchLimit: Boolean(args['strict-batch-limit']),
        onProgress,
      });

      if (jsonLines) {
        return;
      }

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

const searchCommand = defineCommand({
  meta: {
    name: 'search',
    description: '按关键词或授权名搜索当前账号下的资源',
  },
  args: {
    query: { type: 'positional', required: true, description: 'resourceId、授权名或标题关键词' },
    limit: { type: 'string', description: '最多返回条数（默认 20，最大 50）' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const limit = args.limit ? Number(args.limit) : undefined;
      const hits = await searchResources({ query: String(args.query), limit });
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, count: hits.length, items: hits })}\n`);
        return;
      }
      if (!hits.length) {
        consola.warn('未找到匹配资源');
        return;
      }
      consola.info(`找到 ${hits.length} 个资源:`);
      for (const hit of hits) {
        consola.info(
          `${hit.resourceId}  ${hit.resourceName}  ${hit.resourceTitle || '—'}  latest=${hit.latestVersion || '—'}`,
        );
      }
      consola.info('半路接入: freelog-cli bind <resourceId> --apply-listing');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const resourceCommand = defineCommand({
  meta: { name: 'resource', description: '资源批量导入与搜索' },
  subCommands: {
    'import-dir': importDirCommand,
    search: searchCommand,
  },
});
