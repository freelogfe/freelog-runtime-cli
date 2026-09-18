/** `version description` 命令：改已发号描述（PUT），不发新号。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { updateOnlineDescription } from '../../domain/version/description';

/** version description 命令装配（改线上描述）。 */
export function createVersionDescriptionCommand(): Command {
  const command = addSharedOptions(new Command('description'));
  command
    .description(
      // i18n: cli.command.version.description.description
      '改线上已发号描述',
    )
    .option(
      '--version <ver>',
      // i18n: cli.command.version.description.version
      '已发号',
    )
    .option(
      '--description <text>',
      // i18n: cli.command.version.description.text
      '描述',
    )
    .action(async function(this: Command, options: {
      version?: string;
      description?: string;
      file?: string;
      cwd?: string;
    }) {
      const shared = readSharedOptions(this);
      if (options.description === undefined) {
        // i18n: cli.description.text_required
        throw new CliError('请提供 --description', 'DESCRIPTION_REQUIRED');
      }
      const version = await updateOnlineDescription({
        cwd: resolveCwd(shared.cwd),
        file: shared.file,
        version: options.version,
        description: options.description,
      });
      console.log(version);
    });
  return command;
}
