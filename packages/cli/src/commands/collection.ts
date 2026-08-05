import path from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/project.js';
import { isInteractive } from '../core/tty.js';
import * as p from '@clack/prompts';
import {
  collectRulesGet,
  collectRulesSet,
  collectionLogs,
  collectionPolicyApply,
  collectionPolicyList,
  collectionPolicySetStatus,
  collectionPublish,
  collectionRssBind,
  collectionRssSendCode,
  collectionRssSync,
  collectionUpdate,
  collectionVersionSet,
  createCollection,
  itemAdd,
  itemImportDir,
  itemRemove,
  itemReorder,
  itemUpdate,
} from '../services/collectionService.js';

const commonArgs = {
  cwd: { type: 'string' as const },
  'no-auto-pull': { type: 'boolean' as const },
  yes: { type: 'boolean' as const, alias: 'y' },
  test: { type: 'boolean' as const },
  env: { type: 'string' as const, description: '运行环境：production/prod/test/dev' },
  json: { type: 'boolean' as const },
  debug: { type: 'boolean' as const, description: '打印脱敏调试信息' },
};

const createCmd = defineCommand({
  meta: { name: 'create', description: '创建合集壳（subjectType=4）' },
  args: {
    title: { type: 'string', description: '合集标题' },
    type: { type: 'string', description: '合集类型 code' },
    name: { type: 'string', description: '短授权标识（不含 username/）' },
    ...commonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const data = await createCollection({
        cwd: resolveCwd(args.cwd),
        title: args.title,
        typeCode: args.type,
        name: args.name,
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, collection: data })}\n`);
      else consola.success(`已创建合集 ${data.resourceId}（${data.resourceName}）`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const itemAddCmd = defineCommand({
  meta: { name: 'add', description: '添加单品到目录草稿（resourceId 或本地路径）' },
  args: {
    target: { type: 'positional', required: true, description: 'resourceId 或相对路径' },
    title: { type: 'string', description: '条目标题' },
    ...commonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const result = await itemAdd({
        cwd: resolveCwd(args.cwd),
        target: String(args.target),
        title: args.title,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      else consola.success(`已添加单品 ${result.resourceId}`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const itemRemoveCmd = defineCommand({
  meta: { name: 'remove', description: '从目录草稿移除单品' },
  args: {
    itemId: { type: 'positional', required: true, description: 'itemId（可逗号分隔）' },
    ...commonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
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
    ...commonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
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
    ...commonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
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
    'resource-type': { type: 'string', required: true, description: '条目资源 typeCode' },
    'title-prefix': { type: 'string' },
    'item-policy-file': {
      type: 'string',
      description: '子资源策略 JSON 文件；平台要求合集条目资源已上架',
    },
    ...commonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const result = await itemImportDir({
        cwd: resolveCwd(args.cwd),
        dir: String(args.dir),
        resourceTypeCode: String(args['resource-type']),
        titlePrefix:
          typeof args['title-prefix'] === 'string' ? args['title-prefix'] : undefined,
        itemPolicyFile:
          typeof args['item-policy-file'] === 'string'
            ? path.resolve(args['item-policy-file'])
            : undefined,
        yes: Boolean(args.yes),
        noAutoPull: Boolean(args['no-auto-pull']),
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

const itemCommand = defineCommand({
  meta: { name: 'item', description: '合集目录草稿单品' },
  subCommands: {
    add: itemAddCmd,
    'import-dir': itemImportDirCmd,
    remove: itemRemoveCmd,
    update: itemUpdateCmd,
    reorder: itemReorderCmd,
  },
});

const updateCmd = defineCommand({
  meta: { name: 'update', description: '更新合集 listing / 展示设置' },
  args: {
    title: { type: 'string' },
    intro: { type: 'string' },
    cover: { type: 'string' },
    tags: { type: 'string', description: '逗号分隔' },
    'display-sort': { type: 'string', description: 'asc|desc' },
    'display-title': { type: 'string', description: 'rtitle|sn|empty|custom' },
    'display-no': { type: 'string', description: 'show|hide' },
    'display-image': { type: 'string', description: 'show|hide' },
    'display-descr': { type: 'string', description: 'show|hide' },
    'display-view': { type: 'string', description: 'list|card' },
    ...commonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const hasDisplay =
        args['display-sort'] ||
        args['display-title'] ||
        args['display-no'] ||
        args['display-image'] ||
        args['display-descr'] ||
        args['display-view'];
      if (!args.title && args.intro === undefined && !args.cover && !args.tags && !hasDisplay) {
        throw new CliError('请至少提供 listing 或 --display-* 之一', { code: 4 });
      }
      const data = await collectionUpdate({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
        title: args.title,
        intro: args.intro,
        cover: args.cover,
        tags: args.tags ? args.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        displaySort: args['display-sort'],
        displayTitle: args['display-title'],
        displayNo: args['display-no'],
        displayImage: args['display-image'],
        displayDescr: args['display-descr'],
        displayView: args['display-view'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, collection: data })}\n`);
      else consola.success('已更新合集');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const versionSetCmd = defineCommand({
  meta: { name: 'set', description: '更新合集下一次 publish 的发布说明意图' },
  args: {
    version: { type: 'string', description: '已废弃：合集固定版本，不支持设置' },
    description: { type: 'string', description: '合集版本说明' },
    cwd: { type: 'string' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      if (args.version === undefined && args.description === undefined) {
        throw new CliError('请提供 --description', { code: 4 });
      }
      const collection = await collectionVersionSet({
        cwd: resolveCwd(args.cwd),
        version: args.version,
        description: args.description,
      });
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({
            ok: true,
            description: collection.description ?? '',
          })}\n`,
        );
      } else {
        consola.success('已更新合集发布说明意图');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const versionCommand = defineCommand({
  meta: { name: 'version', description: '合集发布说明意图' },
  subCommands: { set: versionSetCmd },
});

const policyApplyCmd = defineCommand({
  meta: { name: 'apply', description: '合集策略（同 policy.json）' },
  args: {
    'from-file': { type: 'string', required: true },
    ...commonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const items = await collectionPolicyApply({
        cwd: resolveCwd(args.cwd),
        fromFile: args['from-file'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, applied: items.length })}\n`);
      else consola.success(`已应用 ${items.length} 条策略`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policyListCmd = defineCommand({
  meta: { name: 'list', description: '列出合集策略' },
  args: {
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const policies = await collectionPolicyList({ cwd });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, policies })}\n`);
      else {
        for (const pol of policies) {
          consola.info(`${pol.policyId || '-'}  ${pol.policyName || '-'}  status=${pol.status}`);
        }
        if (!policies.length) consola.warn('无策略');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policySetCmd = defineCommand({
  meta: { name: 'set', description: '启用或停用合集策略' },
  args: {
    policyId: { type: 'positional', required: true },
    status: { type: 'string', required: true, description: '0 | 1' },
    ...commonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const status = Number(args.status);
      if (status !== 0 && status !== 1) {
        throw new CliError('--status 只能是 0 或 1', { code: 4 });
      }
      await collectionPolicySetStatus({
        cwd: resolveCwd(args.cwd),
        policyId: String(args.policyId),
        status,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: true, policyId: String(args.policyId), status })}\n`,
        );
      } else {
        consola.success(`${status === 1 ? '已启用' : '已停用'} ${String(args.policyId)}`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policyCommand = defineCommand({
  meta: { name: 'policy', description: '合集策略' },
  subCommands: { apply: policyApplyCmd, list: policyListCmd, set: policySetCmd },
});

const publishCmd = defineCommand({
  meta: { name: 'publish', description: '合并目录草稿并发布合集' },
  args: { ...commonArgs },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      if (!args.yes && isInteractive(args.yes)) {
        const ok = await p.confirm({ message: '确认 collection publish？' });
        if (p.isCancel(ok) || !ok) {
          consola.info('已取消');
          process.exitCode = 0;
          return;
        }
      } else if (!args.yes && !isInteractive(args.yes)) {
        throw new CliError('非交互 publish 需要 --yes', { code: 4 });
      }

      const result = await collectionPublish({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      else consola.success(`已发布合集（draft items=${result.itemCount}）`);
    } catch (error) {
      if (error instanceof CliError && error.code === 5 && args.json) {
        const details = (error.details || {}) as Record<string, unknown>;
        process.stdout.write(
          `${JSON.stringify({
            ok: false,
            code: 5,
            error: details.error || 'DEPENDENCY_AUTH_INCOMPLETE',
            message: error.message,
            unresolvedDependencies: details.unresolvedDependencies || [],
            unresolvedItems: details.unresolvedItems || [],
            hint: error.hint,
          })}\n`,
        );
        process.exit(5);
      }
      handleCommandError(error, args.json);
    }
  },
});

const collectRulesGetCmd = defineCommand({
  meta: { name: 'get', description: '读取自动收录规则' },
  args: {
    cwd: { type: 'string' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const rules = await collectRulesGet({ cwd: resolveCwd(args.cwd) });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, rules })}\n`);
      else consola.info(JSON.stringify(rules, null, 2));
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const collectRulesSetCmd = defineCommand({
  meta: { name: 'set', description: '设置自动收录规则' },
  args: {
    'from-file': { type: 'string' },
    status: { type: 'string', description: '0|1 自动收录开关' },
    'serialize-status': { type: 'string', description: '0 连载 / 1 完结' },
    'condition-type': { type: 'string', description: '1 every / 2 some' },
    ...commonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const body = await collectRulesSet({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
        fromFile: args['from-file'],
        status: args.status !== undefined ? (Number(args.status) as 0 | 1) : undefined,
        serializeStatus:
          args['serialize-status'] !== undefined
            ? (Number(args['serialize-status']) as 0 | 1)
            : undefined,
        conditionType:
          args['condition-type'] !== undefined
            ? (Number(args['condition-type']) as 1 | 2)
            : undefined,
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, rules: body })}\n`);
      else consola.success('已更新 collect-rules');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const collectRulesCommand = defineCommand({
  meta: { name: 'collect-rules', description: '自动收录规则' },
  subCommands: { get: collectRulesGetCmd, set: collectRulesSetCmd },
});

const rssSendCodeCmd = defineCommand({
  meta: { name: 'send-code', description: '向邮箱发送 RSS 验证码' },
  args: {
    feedUrl: { type: 'positional', required: true },
    ...commonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      await collectionRssSendCode({
        cwd: resolveCwd(args.cwd),
        feedUrl: String(args.feedUrl),
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      else {
        consola.success('验证码已发送');
        consola.info('请查邮箱获取验证码，再执行 collection rss bind <feedUrl> --code <code> --yes');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const rssBindCmd = defineCommand({
  meta: { name: 'bind', description: '绑定 RSS（须 --code）' },
  args: {
    feedUrl: { type: 'positional', required: true },
    code: { type: 'string', required: true, description: '邮箱验证码' },
    'pub-start': { type: 'string' },
    'pub-end': { type: 'string' },
    ...commonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      if (!args.yes && !isInteractive(args.yes)) {
        throw new CliError('非交互 bind 需要 --yes', { code: 4 });
      }
      const data = await collectionRssBind({
        cwd: resolveCwd(args.cwd),
        feedUrl: String(args.feedUrl),
        code: args.code,
        pubStartDate: args['pub-start'],
        pubEndDate: args['pub-end'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
      else consola.success('已绑定 RSS');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const rssSyncCmd = defineCommand({
  meta: { name: 'sync', description: '同步 RSS 并轮询进度' },
  args: { ...commonArgs },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const result = await collectionRssSync({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      else consola.success('RSS 同步完成');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const rssCommand = defineCommand({
  meta: { name: 'rss', description: '合集 RSS' },
  subCommands: {
    'send-code': rssSendCodeCmd,
    bind: rssBindCmd,
    sync: rssSyncCmd,
  },
});

const logsCmd = defineCommand({
  meta: { name: 'logs', description: '合集变更日志' },
  args: {
    skip: { type: 'string' },
    limit: { type: 'string' },
    cwd: { type: 'string' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const logs = await collectionLogs({
        cwd: resolveCwd(args.cwd),
        skip: args.skip ? Number(args.skip) : undefined,
        limit: args.limit ? Number(args.limit) : undefined,
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, logs })}\n`);
      else consola.info(JSON.stringify(logs, null, 2));
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const collectionCommand = defineCommand({
  meta: { name: 'collection', description: '合集创建与目录管理' },
  subCommands: {
    create: createCmd,
    item: itemCommand,
    update: updateCmd,
    version: versionCommand,
    policy: policyCommand,
    publish: publishCmd,
    'collect-rules': collectRulesCommand,
    rss: rssCommand,
    logs: logsCmd,
  },
});
