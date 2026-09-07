import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { setDraftDescription } from '../../domain/version/draftDescription';

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
    .action((options: { description?: string; file?: string; cwd?: string }) => {
      if (options.description === undefined) {
        // i18n: cli.draft.description_required
        throw new CliError('请提供 --description', 'DRAFT_DESCRIPTION_REQUIRED');
      }
      console.log(setDraftDescription(resolveCwd(options.cwd), options.description, options.file));
    });
}
