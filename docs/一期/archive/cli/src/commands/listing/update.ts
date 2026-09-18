/** `update` 命令：listing（标题/简介/封面/标签）编辑入口。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { updateListing } from '../../domain/listing/update';

/** update 命令装配（改 title/intro/cover/tags）。 */
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
    .action(async function(this: Command, options: {
      title?: string;
      intro?: string;
      cover?: string;
      tags?: string;
      yes?: boolean;
      file?: string;
      cwd?: string;
    }) {
      const shared = readSharedOptions(this);
      await updateListing({
        cwd: resolveCwd(shared.cwd),
        file: shared.file,
        title: options.title,
        intro: options.intro,
        cover: options.cover,
        tags: options.tags,
        yes: shared.yes,
      });
    });
  return command;
}
