import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { updateListing } from '../../domain/listing/update';

export function createUpdateCommand(): Command {
  const command = addSharedOptions(new Command('update'));
  command
    .description(
      // i18n: cli.command.update.description
      '只改标题简介封面标签',
    )
    .option('--title <title>', '标题')
    .option('--intro <intro>', '简介')
    .option('--cover <path>', '封面')
    .option('--tags <tags>', '标签')
    .action(async (options: {
      title?: string;
      intro?: string;
      cover?: string;
      tags?: string;
      yes?: boolean;
      file?: string;
      cwd?: string;
    }) => {
      await updateListing({
        cwd: resolveCwd(options.cwd),
        file: options.file,
        title: options.title,
        intro: options.intro,
        cover: options.cover,
        tags: options.tags,
        yes: options.yes,
      });
    });
  return command;
}
