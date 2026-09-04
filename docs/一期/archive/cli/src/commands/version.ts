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
import {
  finalizeSessionCommand,
  projectStoreFromCwd,
  resolveCommandProjectStore,
} from '../services/store/index.js';
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

import { cliWriteCommandArgs } from '../core/cliArgs.js';
import { infoPublishFileConstraints } from '../services/publishFileHints.js';

const sharedVersionArgs = cliWriteCommandArgs;

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
      const store = projectStoreFromCwd(cwd);
      const rawLevel = (args.level ? String(args.level) : 'patch').toLowerCase();
      if (rawLevel !== 'patch' && rawLevel !== 'minor' && rawLevel !== 'major') {
        throw cliError(I18N_KEYS.bump_level_invalid, { code: 4 });
      }
      const level = rawLevel as BumpLevel;

      const resource = tryLoadResourceProject(cwd);
      const ctx = resource?.data.resourceId
        ? await ensureSynced({ store, noAutoPull: args['no-auto-pull'] })
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
    version: { type: 'string' as const, description: 'semver 版本号' },
    description: { type: 'string' as const, description: '版本说明（写入 manifest 意图）' },
    'video-cover': { type: 'string' as const, description: '下一版视频封面 URL 或本地图片路径' },
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
      const store = projectStoreFromCwd(cwd);
      const resource = tryLoadResourceProject(cwd);
      const ctx = resource?.data.resourceId
        ? await ensureSynced({ store, noAutoPull: args['no-auto-pull'] })
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
        if (isInteractive(args.yes)) {
          const typeCode =
            ctx?.resource.resourceTypeCode || resource?.data.resourceTypeCode || data.resourceTypeCode;
          if (typeCode) {
            await infoPublishFileConstraints({
              cwd,
              filePath: args.file,
              resourceTypeCode: typeCode,
              versionConfig: data,
            });
          }
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
    description: { type: 'string' as const, description: '已发版说明文案' },
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

      if (args.session) {
        if (!args['resource-id']?.trim()) {
          throw cliError(I18N_KEYS.session_resource_id_required, { code: 4 });
        }
        const store = resolveCommandProjectStore({
          cwd: resolveCwd(args.cwd),
          session: true,
          'resource-id': args['resource-id'],
        });
        store.saveVersion({ version: args.version, filePath: '' });
        const result = await editReleasedVersion({
          store,
          version: args.version,
          description: args.description,
          syncProperties: args['sync-properties'],
          noAutoPull: args['no-auto-pull'],
        });
        const payload = finalizeSessionCommand({
          store,
          exportProject: args['export-project'],
          result: result as Record<string, unknown>,
        });
        if (args.json) writeJsonSuccess('version edit', payload);
        else consola.success(`已更新正式版 ${result.version} 元数据（session）`);
        return;
      }

      const result = await editReleasedVersion({
        store: projectStoreFromCwd(resolveCwd(args.cwd)),
        version: args.version,
        description: args.description,
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
      const store = projectStoreFromCwd(resolveCwd(args.cwd));
      const ctx = await ensureSynced({
        store,
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
