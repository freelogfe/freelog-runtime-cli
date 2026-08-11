import * as p from '@clack/prompts';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyWriteCommandFlags, handleCommandError } from '../core/command.js';
import { CliError } from '../core/errors.js';
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

function emitConflictJson(error: CliError) {
  const details = (error.details || {}) as Record<string, unknown>;
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      code: 3,
      error: details.error || 'DRAFT_CONFLICT',
      reason: details.reason,
      message: error.message,
      hint: error.hint,
    })}\n`,
  );
  process.exit(3);
}

const pushCommand = defineCommand({
  meta: { name: 'push', description: '本地 → 平台发版草稿（--collection 为合集表单草稿）' },
  args: {
    collection: { type: 'boolean', description: '合集发版表单草稿（非目录草稿）' },
    force: { type: 'boolean', description: '覆盖远端冲突草稿' },
    upload: { type: 'boolean', description: '独立资源：先上传 filePath' },
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
        process.stdout.write(`${JSON.stringify({ ok: true, collection: Boolean(args.collection), ...result })}\n`);
      } else if (result.skippedPost) {
        consola.success(`草稿已对齐（fingerprint=${result.fingerprint.slice(0, 12)}…）`);
      } else {
        consola.success(t(I18N_KEYS.cli_draft_save_ok));
      }
    } catch (error) {
      if (error instanceof CliError && error.code === 3 && args.json) emitConflictJson(error);
      handleCommandError(error, args.json);
    }
  },
});

const pullCommand = defineCommand({
  meta: { name: 'pull', description: '平台发版草稿 → 本地' },
  args: {
    collection: { type: 'boolean' },
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
      const cwd = resolveCwd(args.cwd);
      const result = args.collection
        ? await collectionDraftPull({ cwd })
        : await draftPull({ cwd, noAutoPull: args['no-auto-pull'] });
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, collection: Boolean(args.collection), ...result })}\n`);
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
    collection: { type: 'boolean' },
    cwd: { type: 'string' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
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
        process.stdout.write(`${JSON.stringify({ ok: true, collection: Boolean(args.collection), ...result })}\n`);
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
