import * as p from '@clack/prompts';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, applyWriteCommandFlags, handleCommandError } from '../core/command.js';
import { CliError } from '../core/errors.js';
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
    throw cliError(I18N_KEYS.non_interactive_needs_yes, { code: 4, hint: '? --yes ???' });
  }
  const ok = await p.confirm({ message: t(I18N_KEYS.createversion_remove_file_confirmation) });
  if (p.isCancel(ok) || !ok) {
    consola.info('???');
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
  env: { type: 'string' as const, description: '?????production/prod/test/dev' },
  json: { type: 'boolean' as const },
  debug: { type: 'boolean' as const, description: '????????' },
};

const bumpCommand = defineCommand({
  meta: { name: 'bump', description: '??? manifest ?????? API?' },
  args: {
    level: {
      type: 'positional' as const,
      required: false,
      description: 'patch|minor|major??? patch?',
    },
    ...sharedVersionArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const rawLevel = (args.level ? String(args.level) : 'patch').toLowerCase();
      if (rawLevel !== 'patch' && rawLevel !== 'minor' && rawLevel !== 'major') {
        throw new CliError('bump ???? patch|minor|major', { code: 4 });
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
        process.stdout.write(
          `${JSON.stringify({ ok: true, previous, version: next, level })}\n`,
        );
      } else {
        consola.success(`?? ${previous || '?'} ? ${next}?${level}?? manifest?`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const setCommand = defineCommand({
  meta: { name: 'set', description: '??????????????????' },
  args: {
    version: { type: 'string' as const },
    description: { type: 'string' as const },
    'video-cover': { type: 'string' as const, description: '?????? URL ???????' },
    file: { type: 'string' as const, description: '???????????' },
    'clear-file': { type: 'boolean' as const, description: '???????????????????' },
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
          throw new CliError('--runtime ? 0.4|0.5', { code: 4 });
        }
        data.runtimeVersion = args.runtime;
      }
      if (data.version !== previousVersion || data.filePath !== previousFilePath || clearFile) {
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
        throw new CliError('version ??', { code: 4 });
      }
      if (!clearFile && !data.filePath?.trim()) {
        throw new CliError('version ? filePath ???? --clear-file ???????', { code: 4 });
      }
      assertSemverLike(data.version);

      saveVersionProject(data, cwd);
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, version: data })}\n`);
      } else if (clearFile) {
        consola.success(`???????????? ${data.version}`);
      } else {
        consola.success(`????????? ${data.version}`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const editCommand = defineCommand({
  meta: { name: 'edit', description: '???????????????????' },
  args: {
    version: { type: 'string' as const, description: '?????????' },
    description: { type: 'string' as const },
    'video-cover': { type: 'string' as const, description: '?????? URL ???????' },
    'sync-properties': {
      type: 'boolean' as const,
      description: '? manifest ? inputAttrs/customPropertyDescriptors ??????',
    },
    ...sharedVersionArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      if (!args.version) throw new CliError('?? --version', { code: 4 });
      const result = await editReleasedVersion({
        cwd: resolveCwd(args.cwd),
        version: args.version,
        description: args.description,
        videoCover: args['video-cover'],
        syncProperties: args['sync-properties'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      else consola.success(`?????? ${result.version} ???`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

import { inspectReleasedVersion } from '../services/versionPropertyService.js';

const showCommand = defineCommand({
  meta: { name: 'show', description: '??????????inputAttrs/customPropertyDescriptors?' },
  args: {
    version: { type: 'string' as const, description: '?????????' },
    ...sharedVersionArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      if (!args.version) throw new CliError('?? --version', { code: 4 });
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
          `?? ${result.version}: inputAttrs=${result.inputAttrs.length}, custom=${result.customPropertyDescriptors.length}`,
        );
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const versionCommand = defineCommand({
  meta: { name: 'version', description: '?????????????' },
  subCommands: {
    set: setCommand,
    bump: bumpCommand,
    edit: editCommand,
    show: showCommand,
  },
});
