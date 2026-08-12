import * as p from '@clack/prompts';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { isInteractive } from '../core/tty.js';
import { draftDiscard, draftPull, draftPush } from '../services/draftService.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { t } from '../i18n/index.js';
import {
  collectionDraftDiscard,
  collectionDraftPull,
  collectionDraftPush,
} from '../services/collectionDraftService.js';
import { cliWriteCommandArgs } from '../core/cliArgs.js';

const collectionDraftFlag = {
  collection: { type: 'boolean' as const, description: '合集发版表单草稿（非目录草稿）' },
};

const draftSharedArgs = {
  ...cliWriteCommandArgs,
  ...collectionDraftFlag,
};

async function confirmDestructive(args: { yes?: boolean }, message: string): Promise<boolean> {
  if (args.yes) return true;
  if (!isInteractive(args.yes)) {
    throw cliError(I18N_KEYS.non_interactive_needs_yes, { code: 4, hint: `加 --yes 后重试` });
  }
  const ok = await p.confirm({ message });
  if (p.isCancel(ok) || !ok) {
    consola.info('已取消');
    process.exitCode = 0;
    return false;
  }
  return true;
}

const pushCommand = defineCommand({
  meta: { name: 'push', description: '本地 → 平台发版草稿（--collection 为合集表单草稿）' },
  args: {
    force: { type: 'boolean', description: '覆盖远端冲突草稿' },
    upload: { type: 'boolean', description: '独立资源：先上传 filePath' },
    ...draftSharedArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      if (args.force) {
        const ok = await confirmDestructive(args, '确认 --force 覆盖平台发版草稿？');
        if (!ok) return;
      }
      const cwd = resolveCwd(args.cwd);
      const result = args.collection
        ? await collectionDraftPush({
            cwd,
            force: args.force,
            noAutoPull: args['no-auto-pull'],
          })
        : await draftPush({
            cwd,
            force: args.force,
            upload: args.upload,
            noAutoPull: args['no-auto-pull'],
          });
      if (args.json) {
        writeJsonSuccess('draft', { collection: Boolean(args.collection), ...result });
      } else if (result.skippedPost) {
        consola.success(`草稿已对齐（fingerprint=${result.fingerprint.slice(0, 12)}…）`);
      } else {
        consola.success(t(I18N_KEYS.cli_draft_save_ok));
      }
    } catch (error) {
      handleCommandError(error, args.json, 'draft push');
    }
  },
});

const pullCommand = defineCommand({
  meta: { name: 'pull', description: '平台发版草稿 → 本地' },
  args: {
    ...draftSharedArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const result = args.collection
        ? await collectionDraftPull({ cwd })
        : await draftPull({ cwd, noAutoPull: args['no-auto-pull'] });
      if (args.json) {
        writeJsonSuccess('draft', { collection: Boolean(args.collection), ...result });
      } else {
        consola.success(
          `已 pull ${args.collection ? '合集' : '独立资源'}草稿（fingerprint=${result.fingerprint.slice(0, 12)}…）`,
        );
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const discardCommand = defineCommand({
  meta: { name: 'discard', description: '删除平台发版草稿并清 draftSync' },
  args: {
    ...draftSharedArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const ok = await confirmDestructive(args, '确认删除平台发版草稿？');
      if (!ok) return;
      const cwd = resolveCwd(args.cwd);
      const result = args.collection
        ? await collectionDraftDiscard({ cwd })
        : await draftDiscard({ cwd });
      if (args.json) {
        writeJsonSuccess('draft', { collection: Boolean(args.collection), ...result });
      } else {
        consola.success(
          result.existed ? '已删除平台发版草稿' : '平台本无草稿（已清本地 draftSync）',
        );
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const draftCommand = defineCommand({
  meta: { name: 'draft', description: '发版草稿 push|pull|discard（--collection 合集表单）' },
  subCommands: {
    push: pushCommand,
    pull: pullCommand,
    discard: discardCommand,
  },
});
