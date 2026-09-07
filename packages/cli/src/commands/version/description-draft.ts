/** `version draft description` 注册：只有更新稿能改描述。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { setDraftDescription } from '../../domain/version/draftDescription';

/** 向 `version draft` 挂 description 子命令。 */
export function registerDraftDescription(draft: Command): void {
  addSharedOptions(draft.command('description'))
    .description(
      // i18n: cli.command.version.draft.description_edit.description
      '只改工作稿描述',
    )
    .option(
      '--description <text>',
      // i18n: cli.command.version.draft.description_edit.text
      '描述',
    )
    .action(function(this: Command, options: { description?: string; file?: string; cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      if (options.description === undefined) {
        // i18n: cli.draft.description_required
        throw new CliError('请提供 --description', 'DRAFT_DESCRIPTION_REQUIRED');
      }
      console.log(setDraftDescription(resolveCwd(options.cwd), options.description, options.file));
    });
}
