/** `version draft description` 注册：只有更新稿能改描述。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
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
    .action(function(this: Command, options: { description?: string }) {
      const shared = readSharedOptions(this);
      if (options.description === undefined) {
        // i18n: cli.draft.description_required
        throw new CliError('请提供 --description', 'DRAFT_DESCRIPTION_REQUIRED');
      }
      console.log(setDraftDescription(resolveCwd(shared.cwd), options.description, shared.file));
    });
}
