import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyGlobalFlags } from '../core/env.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/paths.js';
import { depAdd, depList, depRemove, depUpdate } from '../services/depService.js';
import { depAuthFromMap } from '../services/depAuthService.js';
import { handleCommandError } from './login.js';

const addCommand = defineCommand({
  meta: { name: 'add', description: '添加本地依赖意图（随下版 publish / draft）' },
  args: {
    resourceId: { type: 'positional', required: true, description: '依赖 resourceId' },
    version: { type: 'string', alias: 'v', description: 'versionRange，默认 *' },
    'version-range': { type: 'string' },
    name: { type: 'string', description: 'resourceName（可选）' },
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags(args);
      const deps = await depAdd({
        cwd: resolveCwd(args.cwd),
        resourceId: String(args.resourceId),
        versionRange: args['version-range'] || args.version,
        resourceName: args.name,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, dependencies: deps })}\n`);
      else consola.success(`已添加依赖 ${args.resourceId}（共 ${deps.length}）`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const removeCommand = defineCommand({
  meta: { name: 'remove', description: '移除本地依赖意图' },
  args: {
    resourceId: { type: 'positional', required: true },
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags(args);
      const deps = await depRemove({
        cwd: resolveCwd(args.cwd),
        resourceId: String(args.resourceId),
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, dependencies: deps })}\n`);
      else consola.success(`已移除依赖 ${args.resourceId}`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const updateCommand = defineCommand({
  meta: { name: 'update', description: '更新本地依赖 versionRange' },
  args: {
    resourceId: { type: 'positional', required: true },
    version: { type: 'string', alias: 'v' },
    'version-range': { type: 'string' },
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags(args);
      const range = args['version-range'] || args.version;
      if (!range) throw new CliError('缺少 -v / --version-range', { code: 4 });
      const deps = await depUpdate({
        cwd: resolveCwd(args.cwd),
        resourceId: String(args.resourceId),
        versionRange: range,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, dependencies: deps })}\n`);
      else consola.success(`已更新 ${args.resourceId} → ${range}`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const listCommand = defineCommand({
  meta: { name: 'list', description: '列出本地依赖意图；--tree 读平台依赖树' },
  args: {
    tree: { type: 'boolean', description: '读取平台 dependencyTree' },
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags(args);
      const result = await depList({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
        tree: args.tree,
      });
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: true, dependencies: result.local, tree: result.tree })}\n`,
        );
      } else if (args.tree) {
        consola.info('平台依赖树:');
        process.stdout.write(`${JSON.stringify(result.tree, null, 2)}\n`);
      } else if (result.local.length === 0) {
        consola.info('无本地依赖');
      } else {
        for (const d of result.local) {
          consola.info(`${d.resourceId}  ${d.versionRange || '*'}  ${d.resourceName || ''}`);
        }
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const authCommand = defineCommand({
  meta: { name: 'auth', description: '声明式补签依赖（--policy-map，不含支付）' },
  args: {
    'policy-map': { type: 'string', description: 'auth-map.yaml|json 路径' },
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags(args);
      if (!args['policy-map']) {
        throw new CliError('缺少 --policy-map <file>', { code: 4 });
      }
      const result = await depAuthFromMap({
        cwd: resolveCwd(args.cwd),
        policyMap: args['policy-map'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ...result, ok: true })}\n`);
      else consola.success(`依赖签约完成（${result.succeeded.length} 条）`);
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
            succeeded: details.succeeded,
            failed: details.failed,
            consoleHint: details.consoleHint || error.hint,
          })}\n`,
        );
        process.exit(5);
      }
      handleCommandError(error, args.json);
    }
  },
});

export const depCommand = defineCommand({
  meta: { name: 'dep', description: '依赖 add|remove|list|update|auth' },
  subCommands: {
    add: addCommand,
    remove: removeCommand,
    list: listCommand,
    update: updateCommand,
    auth: authCommand,
  },
});
