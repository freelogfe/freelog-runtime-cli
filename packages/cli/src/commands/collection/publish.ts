import * as p from '@clack/prompts';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import {
  applyCommandFlags,
  applyWriteCommandFlags,
  handleCommandError,
  writeJsonSuccess,
} from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import { isInteractive } from '../../core/tty.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { collectionPublish } from '../../services/collection/index.js';
import { collectionCommonArgs } from './common.js';

export const publishCmd = defineCommand({
  meta: { name: 'publish', description: '合并目录草稿并发布合集' },
  args: {
    ...collectionCommonArgs,
    'dry-run': { type: 'boolean', description: '输出 updateCollection 请求体，不调用 API' },
  },
  async run({ args }) {
    try {
      if (args['dry-run']) applyCommandFlags(args);
      else applyWriteCommandFlags(args);
      if (!args.yes && isInteractive(args.yes) && !args['dry-run']) {
        const ok = await p.confirm({ message: '确认 collection publish？' });
        if (p.isCancel(ok) || !ok) {
          consola.info('已取消');
          process.exitCode = 0;
          return;
        }
      } else if (!args.yes && !isInteractive(args.yes)) {
        throw cliError(I18N_KEYS.non_interactive_publish_needs_yes, { code: 4 });
      }

      const result = await collectionPublish({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
        dryRun: args['dry-run'],
      });
      if (args.json) writeJsonSuccess('collection publish', result);
      else consola.success(`已发布合集（draft items=${result.itemCount}）`);
    } catch (error) {
      handleCommandError(error, args.json, 'collection publish');
    }
  },
});
