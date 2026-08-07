import * as p from '@clack/prompts';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/project.js';
import { loadVersionProject, saveVersionProject, tryLoadResourceProject } from '../config/project.js';
import { editReleasedVersion } from '../services/versionEditService.js';
import { ensureSynced } from '../services/sync/index.js';
import { assertSemverLike } from '../services/validation.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { t } from '../i18n/index.js';
import { isInteractive } from '../core/tty.js';
import fs from 'node:fs';
import path from 'node:path';

async function confirmClearFile(args: { yes?: boolean }): Promise<boolean> {
  if (args.yes) return true;
  if (!isInteractive(args.yes)) {
    throw cliError(I18N_KEYS.non_interactive_needs_yes, { code: 4, hint: '加 --yes 后重试' });
  }
  const ok = await p.confirm({ message: t(I18N_KEYS.createversion_remove_file_confirmation) });
  if (p.isCancel(ok) || !ok) {
    consola.info('已取消');
    process.exitCode = 0;
    return false;
  }
  return true;
}

const setCommand = defineCommand({
  meta: { name: 'set', description: '写本地下一版发布意图（不调平台草稿）' },
  args: {
    version: { type: 'string' },
    description: { type: 'string' },
    'video-cover': { type: 'string', description: '视频版本封面 URL 或本地图片路径' },
    file: { type: 'string', description: '发布文件或构建目录路径' },
    'clear-file': { type: 'boolean', description: '清除本地文件发布意图（交互模式会确认）' },
    runtime: { type: 'string', description: '0.4 | 0.5' },
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
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const resource = tryLoadResourceProject(cwd);
      const ctx = resource?.data.resourceId
        ? await ensureSynced({ cwd, noAutoPull: args['no-auto-pull'] })
        : null;
      const { data } = loadVersionProject(cwd);
      const previousVersion = data.version;
      const previousFilePath = data.filePath;
      const clearFile = Boolean(args['clear-file']);

      if (clearFile && args.file) {
        throw cliError(I18N_KEYS.version_set_clear_file_conflict, { code: 4 });
      }

      if (args.version) {
        assertSemverLike(args.version);
        data.version = args.version;
      }
      if (args.description !== undefined) data.description = args.description;
      if (args['video-cover'] !== undefined) data.videoCover = args['video-cover'];

      if (clearFile) {
        const ok = await confirmClearFile(args);
        if (!ok) return;
        data.filePath = '';
        data.fileSha1 = null;
        data.filename = null;
        data.versionId = null;
      } else if (args.file) {
        const filePath = path.resolve(cwd, args.file);
        if (!fs.existsSync(filePath)) {
          throw cliError(I18N_KEYS.version_set_file_not_found, {
            code: 4,
            params: { path: args.file },
          });
        }
        data.filePath = args.file;
      }

      if (args.runtime) {
        if (args.runtime !== '0.4' && args.runtime !== '0.5') {
          throw new CliError('--runtime 仅 0.4|0.5', { code: 4 });
        }
        data.runtimeVersion = args.runtime;
      }
      if (
        data.version !== previousVersion ||
        data.filePath !== previousFilePath ||
        clearFile
      ) {
        if (!clearFile) {
          data.fileSha1 = null;
          data.filename = null;
          data.versionId = null;
        }
      }
      if (ctx) {
        data.resourceId = ctx.resource.resourceId || data.resourceId;
        data.resourceName = ctx.resource.resourceName || data.resourceName;
        data.resourceTypeCode = ctx.resource.resourceTypeCode || data.resourceTypeCode;
        data.userId = ctx.resource.userId;
        data.username = ctx.resource.username;
      }

      if (!data.version) {
        throw new CliError('version 必填', { code: 4 });
      }
      if (!clearFile && !data.filePath?.trim()) {
        throw new CliError('version 与 filePath 必填（或 --clear-file 清除文件意图）', { code: 4 });
      }
      assertSemverLike(data.version);

      saveVersionProject(data, cwd);
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, version: data })}\n`);
      } else if (clearFile) {
        consola.success(`已清除本地文件意图，版本 ${data.version}`);
      } else {
        consola.success(`已更新本地版本意图 ${data.version}`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const editCommand = defineCommand({
  meta: { name: 'edit', description: '改已发行版元数据（不换文件、不升版本）' },
  args: {
    version: { type: 'string', description: '已存在的正式版本号' },
    description: { type: 'string' },
    'video-cover': { type: 'string', description: '视频版本封面 URL 或本地图片路径' },
    'sync-properties': {
      type: 'boolean',
      description: '将 manifest 中 inputAttrs/customPropertyDescriptors 同步到已发版（≅ Console syncAllProperties）',
    },
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
      applyCommandFlags(args);
      if (!args.version) throw new CliError('缺少 --version', { code: 4 });
      const result = await editReleasedVersion({
        cwd: resolveCwd(args.cwd),
        version: args.version,
        description: args.description,
        videoCover: args['video-cover'],
        syncProperties: args['sync-properties'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      else consola.success(`已更新正式版 ${result.version} 元数据`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

import { inspectReleasedVersion } from '../services/versionPropertyService.js';

const showCommand = defineCommand({
  meta: { name: 'show', description: '读取平台已发版属性（inputAttrs/customPropertyDescriptors）' },
  args: {
    version: { type: 'string', description: '已存在的正式版本号' },
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
      applyCommandFlags(args);
      if (!args.version) throw new CliError('缺少 --version', { code: 4 });
      const ctx = await ensureSynced({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
      });
      const result = await inspectReleasedVersion({
        resourceId: ctx.resource.resourceId!,
        version: args.version,
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      else {
        consola.info(
          `版本 ${result.version}: inputAttrs=${result.inputAttrs.length}, custom=${result.customPropertyDescriptors.length}`,
        );
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const versionCommand = defineCommand({
  meta: { name: 'version', description: '版本意图与已发行版本元数据' },
  subCommands: {
    set: setCommand,
    edit: editCommand,
    show: showCommand,
  },
});
