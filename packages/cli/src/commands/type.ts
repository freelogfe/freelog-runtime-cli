import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { cliReadCommandArgs } from '../core/cliArgs.js';
import { requireAuth } from '../core/auth.js';
import { assertResourceTypeCode, listResourceTypes } from '../services/typeService.js';
import { pickResourceTypeInteractive, type ScaffoldInitCategory } from '../services/init/index.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

function flattenTypes(value: unknown): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.code || record.resourceTypeCode || record.typeCode) rows.push(record);
    for (const key of ['children', 'childNodes', 'dataList', 'list']) visit(record[key]);
  };
  visit(value);
  return rows;
}

function typeCode(row: Record<string, unknown>): string {
  return String(row.code || row.resourceTypeCode || row.typeCode || '');
}

function typeName(row: Record<string, unknown>): string {
  return String(row.name || row.resourceTypeName || row.title || row.typeName || '');
}

const listCommand = defineCommand({
  meta: { name: 'list', description: '列出平台资源类型' },
  args: {
    subject: { type: 'string', description: 'resource | collection' },
    ...cliReadCommandArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const data = await listResourceTypes({
        subjectType: args.subject === 'collection' ? 4 : undefined,
      });
      const types = flattenTypes(data);
      if (args.json) {
        writeJsonSuccess('type', { types });
      } else {
        for (const row of types) consola.info(`${typeCode(row)}  ${typeName(row)}`);
        if (!types.length) consola.warn('未返回资源类型');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const searchCommand = defineCommand({
  meta: { name: 'search', description: '搜索平台资源类型' },
  args: {
    keyword: { type: 'positional', required: true, description: '搜索关键词（匹配 code 或名称）' },
    subject: { type: 'string', description: 'resource | collection' },
    ...cliReadCommandArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const keyword = String(args.keyword).toLowerCase();
      const data = await listResourceTypes({
        subjectType: args.subject === 'collection' ? 4 : undefined,
      });
      const types = flattenTypes(data).filter((row) => {
        return (
          typeCode(row).toLowerCase().includes(keyword) ||
          typeName(row).toLowerCase().includes(keyword)
        );
      });
      if (!types.length) {
        throw cliError(I18N_KEYS.resource_type_not_found, {
          code: 4,
          hint: '运行 freelog-cli type list 查看全部类型',
        });
      }
      if (args.json) {
        writeJsonSuccess('type', { types });
      } else {
        for (const row of types) consola.info(`${typeCode(row)}  ${typeName(row)}`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const infoCommand = defineCommand({
  meta: { name: 'info', description: '查看资源类型能力' },
  args: {
    code: { type: 'positional', required: true, description: '资源类型 code（如 RT005001）' },
    ...cliReadCommandArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const info = await assertResourceTypeCode(String(args.code));
      if (args.json) {
        writeJsonSuccess('type', { info });
      } else {
        consola.info(JSON.stringify(info, null, 2));
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const pickCommand = defineCommand({
  meta: {
    name: 'pick',
    description: '交互式逐级选择平台叶子资源类型（需已 login）',
  },
  args: {
    category: {
      type: 'string',
      description: '跳过第一层：theme | widget | package | other | collection',
    },
    subject: { type: 'string', description: 'collection 时用 collection' },
    ...cliReadCommandArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      requireAuth();
      let category = args.category as ScaffoldInitCategory | undefined;
      if (category && !['theme', 'widget', 'package', 'other', 'collection'].includes(category)) {
        throw cliError(I18N_KEYS.invalid_category, {
          code: 4,
          hint: 'theme | widget | package | other | collection',
        });
      }
      if (args.subject === 'collection') {
        category = 'collection';
      }
      const picked = await pickResourceTypeInteractive({ category });
      if (args.json) {
        writeJsonSuccess('type pick', {
          code: picked.code,
          name: picked.name,
          pathLabel: picked.pathLabel,
          resourceTypeLabels: picked.resourceTypeLabels,
          suggestedScaffold: picked.suggestedScaffold,
          category: picked.category,
        });
      } else {
        consola.success(`已选择: ${picked.pathLabel}`);
        consola.info(`resourceTypeCode=${picked.code}`);
        consola.info(`建议 scaffold=${picked.suggestedScaffold}`);
      }
    } catch (error) {
      handleCommandError(error, args.json, 'type pick');
    }
  },
});

export const typeCommand = defineCommand({
  meta: { name: 'type', description: '资源类型发现' },
  subCommands: {
    list: listCommand,
    search: searchCommand,
    info: infoCommand,
    pick: pickCommand,
  },
});
