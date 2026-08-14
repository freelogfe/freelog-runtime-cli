import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { depAdd, depList, depRemove, depUpdate } from '../services/depService.js';
import { depAuthFromMap } from '../services/depAuthService.js';
import { writeAuthMapInitFile } from '../services/scaffoldInit.js';
import { cliReadCommandArgs, cliSyncWriteArgs, cliWriteCommandArgs } from '../core/cliArgs.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import {
  assertSessionMode,
  ensureSessionVersionIntent,
  finalizeSessionCommand,
  resolveCommandProjectStore,
} from '../services/store/index.js';

const depSessionArgs = {
  'target-version': {
    type: 'string' as const,
    description: '会话模式：下一版 semver 意图（Store 无 version 块时必填，≅ Console versionInput）',
  },
};

function stringArg(value: string | boolean | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function resolveDepStore(args: {
  cwd?: string;
  session?: boolean;
  'resource-id'?: string;
}) {
  if (args.session) {
    assertSessionMode(args);
    if (!args['resource-id']?.trim()) {
      throw cliError(I18N_KEYS.session_resource_id_required, { code: 4 });
    }
    return resolveCommandProjectStore({
      cwd: resolveCwd(args.cwd),
      session: true,
      'resource-id': args['resource-id'],
    });
  }
  return resolveCommandProjectStore({ cwd: resolveCwd(args.cwd) });
}

const addCommand = defineCommand({
  meta: { name: 'add', description: '添加本地依赖意图（随下版 publish / draft）' },
  args: {
    resourceId: { type: 'positional', required: true, description: '依赖 resourceId' },
    version: { type: 'string', alias: 'v', description: 'versionRange（semver 可解析：*、^1.0.0、>=1.0.0）' },
    'version-range': { type: 'string', description: 'semver 范围（同 --version）' },
    name: { type: 'string', description: 'resourceName（可选）' },
    ...depSessionArgs,
    ...cliSyncWriteArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const store = resolveDepStore(args);
      ensureSessionVersionIntent(store, stringArg(args['target-version']));
      const deps = await depAdd({
        store,
        resourceId: String(args.resourceId),
        versionRange: args['version-range'] || args.version,
        resourceName: args.name,
        noAutoPull: args['no-auto-pull'],
      });
      const payload = finalizeSessionCommand({
        store,
        exportProject: stringArg(args['export-project']),
        result: { dependencies: deps },
      });
      if (args.json) writeJsonSuccess('dep add', payload);
      else consola.success(`已添加依赖 ${args.resourceId}（共 ${deps.length}）`);
    } catch (error) {
      handleCommandError(error, args.json, 'dep add');
    }
  },
});

const removeCommand = defineCommand({
  meta: { name: 'remove', description: '移除本地依赖意图' },
  args: {
    resourceId: { type: 'positional', required: true, description: '依赖 resourceId' },
    ...depSessionArgs,
    ...cliSyncWriteArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const store = resolveDepStore(args);
      ensureSessionVersionIntent(store, stringArg(args['target-version']));
      const deps = await depRemove({
        store,
        resourceId: String(args.resourceId),
        noAutoPull: args['no-auto-pull'],
      });
      const payload = finalizeSessionCommand({
        store,
        exportProject: stringArg(args['export-project']),
        result: { dependencies: deps },
      });
      if (args.json) writeJsonSuccess('dep remove', payload);
      else consola.success(`已移除依赖 ${args.resourceId}`);
    } catch (error) {
      handleCommandError(error, args.json, 'dep remove');
    }
  },
});

const updateCommand = defineCommand({
  meta: { name: 'update', description: '更新本地依赖 versionRange' },
  args: {
    resourceId: { type: 'positional', required: true, description: '依赖 resourceId' },
    version: { type: 'string', alias: 'v', description: '新的 versionRange（semver 可解析）' },
    'version-range': { type: 'string', description: 'semver 范围（同 --version）' },
    ...depSessionArgs,
    ...cliSyncWriteArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const range = args['version-range'] || args.version;
      if (!range) throw cliError(I18N_KEYS.missing_version_range, { code: 4 });
      const store = resolveDepStore(args);
      ensureSessionVersionIntent(store, stringArg(args['target-version']));
      const deps = await depUpdate({
        store,
        resourceId: String(args.resourceId),
        versionRange: range,
        noAutoPull: args['no-auto-pull'],
      });
      const payload = finalizeSessionCommand({
        store,
        exportProject: stringArg(args['export-project']),
        result: { dependencies: deps },
      });
      if (args.json) writeJsonSuccess('dep update', payload);
      else consola.success(`已更新 ${args.resourceId} → ${range}`);
    } catch (error) {
      handleCommandError(error, args.json, 'dep update');
    }
  },
});

const listCommand = defineCommand({
  meta: { name: 'list', description: '列出本地依赖意图；--tree 读平台依赖树' },
  args: {
    tree: { type: 'boolean', description: '读取平台 dependencyTree' },
    ...depSessionArgs,
    ...cliSyncWriteArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const store = resolveDepStore(args);
      ensureSessionVersionIntent(store, stringArg(args['target-version']));
      const result = await depList({
        store,
        noAutoPull: args['no-auto-pull'],
        tree: args.tree,
      });
      const payload = finalizeSessionCommand({
        store,
        exportProject: stringArg(args['export-project']),
        result: { dependencies: result.local, tree: result.tree },
      });
      if (args.json) {
        writeJsonSuccess('dep list', payload);
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
      handleCommandError(error, args.json, 'dep list');
    }
  },
});

const authCommand = defineCommand({
  meta: { name: 'auth', description: '声明式补签依赖（--policy-map，不含支付）' },
  args: {
    'policy-map': { type: 'string', description: 'auth-map.yaml|json 路径' },
    version: {
      type: 'string',
      description: '会话模式：读 resourceVersionInfo1 的已发版号（默认 latestVersion）',
    },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const store = resolveDepStore(args);
      if (!args['policy-map']) {
        throw cliError(I18N_KEYS.missing_policy_map, { code: 4 });
      }
      const result = await depAuthFromMap({
        store,
        policyMap: args['policy-map'],
        noAutoPull: args['no-auto-pull'],
        version: args.version,
      });
      const payload = finalizeSessionCommand({
        store,
        exportProject: args['export-project'],
        result: result as Record<string, unknown>,
      });
      if (args.json) writeJsonSuccess('dep auth', payload);
      else consola.success(`依赖签约完成（${result.succeeded.length} 条）`);
    } catch (error) {
      handleCommandError(error, args.json, 'dep auth');
    }
  },
});

const initAuthMapCommand = defineCommand({
  meta: { name: 'init-auth-map', description: '生成 auth-map.yaml 依赖签约模板' },
  args: {
    out: { type: 'string', description: '输出文件名，默认 auth-map.yaml' },
    force: { type: 'boolean', description: '覆盖已有文件' },
    ...cliReadCommandArgs,
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
        writeJsonSuccess('dep init-auth-map', { path: outfile, skipped });
      } else if (skipped) {
        consola.info(`${outfile} 已存在（加 --force 覆盖）`);
      } else {
        consola.success(`已创建 ${outfile}`);
        consola.info('编辑 resourceId / policyIds 后: freelog-cli dep auth --policy-map auth-map.yaml --yes');
      }
    } catch (error) {
      handleCommandError(error, args.json, 'dep init-auth-map');
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
