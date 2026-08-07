import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import { isInteractive } from '../../core/tty.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  collectionRssBind,
  collectionRssSendCode,
  collectionRssSync,
} from '../../services/collection/index.js';
import { collectionCommonArgs } from './common.js';

const rssSendCodeCmd = defineCommand({
  meta: { name: 'send-code', description: '向邮箱发送 RSS 验证码' },
  args: {
    feedUrl: { type: 'positional', required: true },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      await collectionRssSendCode({
        cwd: resolveCwd(args.cwd),
        feedUrl: String(args.feedUrl),
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      else {
        consola.success('验证码已发送');
        consola.info('请查邮箱获取验证码，再执行 collection rss bind <feedUrl> --code <code> --yes');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const rssBindCmd = defineCommand({
  meta: { name: 'bind', description: '绑定 RSS（须 --code）' },
  args: {
    feedUrl: { type: 'positional', required: true },
    code: { type: 'string', required: true, description: '邮箱验证码' },
    'pub-start': { type: 'string' },
    'pub-end': { type: 'string' },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      if (!args.yes && !isInteractive(args.yes)) {
        throw cliError(I18N_KEYS.non_interactive_bind_needs_yes, { code: 4 });
      }
      const data = await collectionRssBind({
        cwd: resolveCwd(args.cwd),
        feedUrl: String(args.feedUrl),
        code: args.code,
        pubStartDate: args['pub-start'],
        pubEndDate: args['pub-end'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
      else consola.success('已绑定 RSS');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const rssSyncCmd = defineCommand({
  meta: { name: 'sync', description: '同步 RSS 并轮询进度' },
  args: { ...collectionCommonArgs },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const result = await collectionRssSync({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      else consola.success('RSS 同步完成');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const rssCommand = defineCommand({
  meta: { name: 'rss', description: '合集 RSS' },
  subCommands: {
    'send-code': rssSendCodeCmd,
    bind: rssBindCmd,
    sync: rssSyncCmd,
  },
});
