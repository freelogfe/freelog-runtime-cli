import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { updateOnlineDescription } from '../../domain/version/description';

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
    .action(async (options: {
      version?: string;
      description?: string;
      file?: string;
      cwd?: string;
    }) => {
      if (options.description === undefined) {
        // i18n: cli.description.text_required
        throw new CliError('请提供 --description', 'DESCRIPTION_REQUIRED');
      }
      const version = await updateOnlineDescription({
        cwd: resolveCwd(options.cwd),
        file: options.file,
        version: options.version,
        description: options.description,
      });
      console.log(version);
    });
  return command;
}
