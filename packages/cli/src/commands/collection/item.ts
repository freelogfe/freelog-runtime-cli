import path from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyWriteCommandFlags, handleCommandError } from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import {
  itemAdd,
  itemImportDir,
  itemRemove,
  itemReorder,
  itemUpdate,
} from '../../services/collection/index.js';
import { collectionCommonArgs } from './common.js';

const itemAddCmd = defineCommand({
  meta: { name: 'add', description: '添加目录项到目录草稿（resourceId 或本地路径）' },
  args: {
    target: { type: 'positional', required: true, description: 'resourceId 或相对路径' },
    title: { type: 'string', description: '条目标题' },
    'auth-excluded-file': {
      type: 'string',
      description: '目录项 authExcludedItems YAML/JSON（≅ Console FContractHandleDrawer）',
    },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const result = await itemAdd({
        cwd: resolveCwd(args.cwd),
        target: String(args.target),
        title: args.title,
        authExcludedFile: args['auth-excluded-file'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      else consola.success(`已添加目录项 ${result.resourceId}`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const itemRemoveCmd = defineCommand({
  meta: { name: 'remove', description: '从目录草稿移除目录项' },
  args: {
    itemId: { type: 'positional', required: true, description: 'itemId（可逗号分隔）' },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const ids = String(args.itemId)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await itemRemove({
        cwd: resolveCwd(args.cwd),
        itemIds: ids,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, removed: ids })}\n`);
      else consola.success(`已移除 ${ids.length} 条`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const itemUpdateCmd = defineCommand({
  meta: { name: 'update', description: '更新目录草稿条目标题' },
  args: {
    itemId: { type: 'positional', required: true },
    title: { type: 'string', required: true },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      await itemUpdate({
        cwd: resolveCwd(args.cwd),
        itemId: String(args.itemId),
        title: args.title,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      else consola.success('已更新条目标题');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const itemReorderCmd = defineCommand({
  meta: { name: 'reorder', description: '重排目录草稿' },
  args: {
    'order-file': { type: 'string', description: 'JSON itemId 数组' },
    'sort-field': {
      type: 'string',
      description: 'createDate|itemTitle|sortId|resourceUpdateDate',
    },
    'sort-type': { type: 'string', description: '1 升序 / -1 降序' },
    'target-sort-id': { type: 'string' },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const sortType =
        args['sort-type'] === '-1' || args['sort-type'] === 'desc' ? (-1 as const) : (1 as const);
      const result = await itemReorder({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
        orderFile: args['order-file'],
        sortField: args['sort-field'] as
          | 'createDate'
          | 'itemTitle'
          | 'sortId'
          | 'resourceUpdateDate'
          | undefined,
        sortType,
        targetSortId: args['target-sort-id'] ? Number(args['target-sort-id']) : undefined,
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      else consola.success('已重排');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const itemImportDirCmd = defineCommand({
  meta: { name: 'import-dir', description: '导入目录为多个资源并加入合集目录草稿' },
  args: {
    dir: { type: 'positional', required: true },
    'resource-type': { type: 'string', description: '条目资源 typeCode；也可写在 --config defaults.resourceTypeCode' },
    'resource-type-name': { type: 'string', description: '自定义条目资源类型名（可选）' },
    'title-prefix': { type: 'string' },
    config: { type: 'string', description: 'freelog.batch.json/yaml；默认自动发现目录内同名文件' },
    'item-policy-file': {
      type: 'string',
      description: '子资源策略 JSON 文件；平台要求合集条目资源已上架',
    },
    'strict-batch-limit': {
      type: 'boolean',
      description: '与 Console 一致：单次最多 20 个文件（默认自动分 batch 并 warn）',
    },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const result = await itemImportDir({
        cwd: resolveCwd(args.cwd),
        dir: String(args.dir),
        resourceTypeCode:
          typeof args['resource-type'] === 'string' ? String(args['resource-type']) : undefined,
        resourceTypeName:
          typeof args['resource-type-name'] === 'string'
            ? String(args['resource-type-name'])
            : undefined,
        titlePrefix:
          typeof args['title-prefix'] === 'string' ? args['title-prefix'] : undefined,
        configFile: typeof args.config === 'string' ? args.config : undefined,
        itemPolicyFile:
          typeof args['item-policy-file'] === 'string'
            ? path.resolve(resolveCwd(args.cwd), args['item-policy-file'])
            : undefined,
        yes: Boolean(args.yes),
        noAutoPull: Boolean(args['no-auto-pull']),
        strictBatchLimit: Boolean(args['strict-batch-limit']),
      });
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      } else {
        consola.success(`已导入并加入合集 ${result.created.length} 个资源`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const itemCommand = defineCommand({
  meta: { name: 'item', description: '合集目录草稿项' },
  subCommands: {
    add: itemAddCmd,
    'import-dir': itemImportDirCmd,
    remove: itemRemoveCmd,
    update: itemUpdateCmd,
    reorder: itemReorderCmd,
  },
});
