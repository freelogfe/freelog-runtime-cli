import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/project.js';
import { loadVersionProject, saveVersionProject, tryLoadResourceProject } from '../config/project.js';
import { editReleasedVersion } from '../services/versionEditService.js';
import { ensureSynced } from '../services/syncService.js';
import { assertSemverLike } from '../services/validation.js';

const setCommand = defineCommand({
  meta: { name: 'set', description: '写本地下一版发布意图（不调平台草稿）' },
  args: {
    version: { type: 'string' },
    description: { type: 'string' },
    'video-cover': { type: 'string', description: '视频版本封面 URL 或本地图片路径' },
    file: { type: 'string', description: '发布文件或构建目录路径' },
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

      if (args.version) {
        assertSemverLike(args.version);
        data.version = args.version;
      }
      if (args.description !== undefined) data.description = args.description;
      if (args['video-cover'] !== undefined) data.videoCover = args['video-cover'];
      if (args.file) data.filePath = args.file;
      if (args.runtime) {
        if (args.runtime !== '0.4' && args.runtime !== '0.5') {
          throw new CliError('--runtime 仅 0.4|0.5', { code: 4 });
        }
        data.runtimeVersion = args.runtime;
      }
      if (data.version !== previousVersion || data.filePath !== previousFilePath) {
        data.fileSha1 = null;
        data.filename = null;
        data.versionId = null;
      }
      if (ctx) {
        data.resourceId = ctx.resource.resourceId || data.resourceId;
        data.resourceName = ctx.resource.resourceName || data.resourceName;
        data.resourceTypeCode = ctx.resource.resourceTypeCode || data.resourceTypeCode;
        data.userId = ctx.resource.userId;
        data.username = ctx.resource.username;
      }

      if (!data.version || !data.filePath) {
        throw new CliError('version 与 filePath 必填', { code: 4 });
      }
      assertSemverLike(data.version);

      saveVersionProject(data, cwd);
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, version: data })}\n`);
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
