import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { draftDiscard } from '../../domain/version/draftDiscard';
import { draftPull } from '../../domain/version/draftPull';

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
    .action(async (options: {
      version?: string;
      yes?: boolean;
      file?: string;
      cwd?: string;
    }) => {
      const text = await draftPull({
        cwd: resolveCwd(options.cwd),
        file: options.file,
        version: options.version,
        yes: options.yes,
      });
      console.log(text);
    });

  addSharedOptions(draft.command('discard'))
    .description(
      // i18n: cli.command.version.draft.discard.description
      '丢掉工作稿',
    )
    .action((options: { file?: string; cwd?: string }) => {
      console.log(draftDiscard(resolveCwd(options.cwd), options.file));
    });

  return draft;
}
