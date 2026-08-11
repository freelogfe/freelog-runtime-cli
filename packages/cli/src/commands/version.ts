import * as p from '@clack/prompts';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import {
  loadVersionProject,
  resolveCwd,
  saveVersionProject,
  tryLoadResourceProject,
} from '../config/project.js';
import { editReleasedVersion } from '../services/versionEditService.js';
import { ensureSynced } from '../services/sync/index.js';
import { assertSemverLike } from '../services/validation.js';
import { computeManifestBumpVersion, type BumpLevel } from '../services/versionBumpService.js';
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

const sharedVersionArgs = {
  cwd: { type: 'string' as const },
  'no-auto-pull': { type: 'boolean' as const },
  yes: { type: 'boolean' as const, alias: 'y' as const },
  test: { type: 'boolean' as const },
  env: { type: 'string' as const, description: '运行环境：production/prod/test/dev' },
  json: { type: 'boolean' as const },
  debug: { type: 'boolean' as const, description: '打印脱敏调试信息' },
};

const bumpCommand = defineCommand({
  meta: { name: 'bump', description: '递增 manifest 中的版本号（不调用发布 API）' },
  args: {
    level: {
      type: 'positional' as const,
      required: false,
      description: 'patch|minor|major，默认 patch',
    },
    ...sharedVersionArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const rawLevel = (args.level ? String(args.level) : 'patch').toLowerCase();
      if (rawLevel !== 'patch' && rawLevel !== 'minor' && rawLevel !== 'major') {
        throw cliError(I18N_KEYS.bump_level_invalid, { code: 4 });
      }
      const level = rawLevel as BumpLevel;

      const resource = tryLoadResourceProject(cwd);
      const ctx = resource?.data.resourceId
        ? await ensureSynced({ cwd, noAutoPull: args['no-auto-pull'] })
        : null;
      const { data } = loadVersionProject(cwd);
      const previous = data.version;
      const next = computeManifestBumpVersion({
        currentVersion: data.version || ctx?.info.latestVersion || '1.0.0',
        latestPlatform: ctx?.info.latestVersion,
        level,
      });
      data.version = next;
      if (ctx) {
        data.resourceId = ctx.resource.resourceId || data.resourceId;
        data.resourceName = ctx.resource.resourceName || data.resourceName;
        data.resourceTypeCode = ctx.resource.resourceTypeCode || data.resourceTypeCode;
        data.userId = ctx.resource.userId;
        data.username = ctx.resource.username;
      }
      saveVersionProject(data, cwd);

      if (args.json) {
        writeJsonSuccess('version', { previous, version: next, level });
      } else {
        consola.success(`版本已从 ${previous || '未设置'} 递增为 ${next}（${level}，仅修改 manifest）`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const setCommand = defineCommand({
  meta: { name: 'set', description: '写本地下一版发布意图（不调用平台草稿 API）' },
  args: {
    version: { type: 'string' as const },
    description: { type: 'string' as const },
    'video-cover': { type: 'string' as const, description: '视频版本封面 URL 或本地图片路径' },
    file: { type: 'string' as const, description: '发布文件或构建目录路径' },
    'artifact-mode': {
      type: 'string' as const,
      description: '发行物模式：file 或 directory-zip',
    },
    'clear-file': { type: 'boolean' as const, description: '清除本地文件发布意图（交互模式会确认）' },
    runtime: { type: 'string' as const, description: '0.4 | 0.5' },
    ...sharedVersionArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const resource = tryLoadResourceProject(cwd);
      const ctx = resource?.data.resourceId
        ? await ensureSynced({ cwd, noAutoPull: args['no-auto-pull'] })
        : null;
      const { data } = loadVersionProject(cwd);
      const previousVersion = data.version;
      const previousFilePath = data.filePath;
      const previousArtifactMode = data.artifactMode;
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
      if (args['artifact-mode'] !== undefined) {
        if (args['artifact-mode'] !== 'file' && args['artifact-mode'] !== 'directory-zip') {
          throw cliError(I18N_KEYS.artifact_mode_invalid, { code: 4 });
        }
        data.artifactMode = args['artifact-mode'];
      }

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
          throw cliError(I18N_KEYS.runtime_flag_only_04_05, { code: 4 });
        }
        data.runtimeVersion = args.runtime;
      }
      if (
        data.version !== previousVersion ||
        data.filePath !== previousFilePath ||
        data.artifactMode !== previousArtifactMode ||
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
        throw cliError(I18N_KEYS.naming_convention_version_required, { code: 4 });
      }
      if (!clearFile && !data.filePath?.trim()) {
        throw cliError(I18N_KEYS.version_and_filepath_or_clear_required, { code: 4 });
      }
      assertSemverLike(data.version);

      saveVersionProject(data, cwd);
      if (args.json) {
        writeJsonSuccess('version', { version: data });
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
  meta: { name: 'edit', description: '修改已发行版本的可维护元数据（不换文件、不升版本）' },
  args: {
    version: { type: 'string' as const, description: '已存在的正式版本号' },
    description: { type: 'string' as const },
    'video-cover': { type: 'string' as const, description: '视频版本封面 URL 或本地图片路径' },
    'sync-properties': {
      type: 'boolean' as const,
      description: '将 manifest 中的 inputAttrs/customPropertyDescriptors 同步到已发版',
    },
    ...sharedVersionArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      if (!args.version) throw cliError(I18N_KEYS.missing_version_flag, { code: 4 });
      const result = await editReleasedVersion({
        cwd: resolveCwd(args.cwd),
        version: args.version,
        description: args.description,
        videoCover: args['video-cover'],
        syncProperties: args['sync-properties'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) writeJsonSuccess('version', result);
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
    version: { type: 'string' as const, description: '已存在的正式版本号' },
    ...sharedVersionArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      if (!args.version) throw cliError(I18N_KEYS.missing_version_flag, { code: 4 });
      const ctx = await ensureSynced({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
      });
      const result = await inspectReleasedVersion({
        resourceId: ctx.resource.resourceId!,
        version: args.version,
      });
      if (args.json) writeJsonSuccess('version', result);
      else {
        consola.info(
          `版本 ${result.version}：inputAttrs=${result.inputAttrs.length}，custom=${result.customPropertyDescriptors.length}`,
        );
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const versionCommand = defineCommand({
  meta: { name: 'version', description: '管理下一版发布意图与已发行版本元数据' },
  subCommands: {
    set: setCommand,
    bump: bumpCommand,
    edit: editCommand,
    show: showCommand,
  },
});
