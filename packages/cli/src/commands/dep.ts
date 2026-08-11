import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { depAdd, depList, depRemove, depUpdate } from '../services/depService.js';
import { depAuthFromMap } from '../services/depAuthService.js';
import { writeAuthMapInitFile } from '../services/scaffoldInit.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

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
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const deps = await depAdd({
        cwd: resolveCwd(args.cwd),
        resourceId: String(args.resourceId),
        versionRange: args['version-range'] || args.version,
        resourceName: args.name,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) writeJsonSuccess('dep', { dependencies: deps });
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
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const deps = await depRemove({
        cwd: resolveCwd(args.cwd),
        resourceId: String(args.resourceId),
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) writeJsonSuccess('dep', { dependencies: deps });
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
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const range = args['version-range'] || args.version;
      if (!range) throw cliError(I18N_KEYS.missing_version_range, { code: 4 });
      const deps = await depUpdate({
        cwd: resolveCwd(args.cwd),
        resourceId: String(args.resourceId),
        versionRange: range,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) writeJsonSuccess('dep', { dependencies: deps });
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
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const result = await depList({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
        tree: args.tree,
      });
      if (args.json) {
        writeJsonSuccess('dep', { dependencies: result.local, tree: result.tree });
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
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      if (!args['policy-map']) {
        throw cliError(I18N_KEYS.missing_policy_map, { code: 4 });
      }
      const result = await depAuthFromMap({
        cwd: resolveCwd(args.cwd),
        policyMap: args['policy-map'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) writeJsonSuccess('dep', result);
      else consola.success(`依赖签约完成（${result.succeeded.length} 条）`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const initAuthMapCommand = defineCommand({
  meta: { name: 'init-auth-map', description: '生成 auth-map.yaml 依赖签约模板' },
  args: {
    out: { type: 'string', description: '输出文件名，默认 auth-map.yaml' },
    force: { type: 'boolean', description: '覆盖已有文件' },
    cwd: { type: 'string' },
    test: { type: 'boolean' },
    env: { type: 'string' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const { path: outfile, skipped } = writeAuthMapInitFile(cwd, {
        force: args.force,
        filename: args.out,
      });
      if (args.json) {
        writeJsonSuccess('dep', { path: outfile, skipped });
      } else if (skipped) {
        consola.info(`${outfile} 已存在（加 --force 覆盖）`);
      } else {
        consola.success(`已创建 ${outfile}`);
        consola.info('编辑 resourceId / policyIds 后: freelog-cli dep auth --policy-map auth-map.yaml --yes');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const depCommand = defineCommand({
  meta: { name: 'dep', description: '依赖 add|remove|list|update|auth|init-auth-map' },
  subCommands: {
    add: addCommand,
    remove: removeCommand,
    list: listCommand,
    update: updateCommand,
    auth: authCommand,
    'init-auth-map': initAuthMapCommand,
  },
});
