/** `version draft pull/discard` 命令：拉底 / 丢稿。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { draftDiscard } from '../../domain/version/draftDiscard';
import { draftPull } from '../../domain/version/draftPull';

/** version draft pull/discard 命令装配。 */
export function createVersionDraftCommand(): Command {
  const draft = addSharedOptions(new Command('draft'));
  draft.description(
    // i18n: cli.command.version.draft.description
    '管本地工作稿',
  );

  addSharedOptions(draft.command('pull'))
    .description(
      // i18n: cli.command.version.draft.pull.description
      '拉已发号写入工作稿',
    )
    .option(
      '--version <ver>',
      // i18n: cli.command.version.draft.pull.version
      '已发号',
    )
    .action(async function(this: Command, options: {
      version?: string;
      yes?: boolean;
      file?: string;
      cwd?: string;
    }) {
      const shared = readSharedOptions(this);
      const text = await draftPull({
        cwd: resolveCwd(shared.cwd),
        file: shared.file,
        version: options.version,
        yes: shared.yes,
      });
      console.log(text);
    });

  addSharedOptions(draft.command('discard'))
    .description(
      // i18n: cli.command.version.draft.discard.description
      '丢掉工作稿',
    )
    .action(function(this: Command) {
      const shared = readSharedOptions(this);
      console.log(draftDiscard(resolveCwd(shared.cwd), shared.file));
    });

  return draft;
}
