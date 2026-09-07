import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { validateOnline } from '../../domain/online/validate';

export function createValidateCommand(): Command {
  const command = addSharedOptions(new Command('validate'));
  command
    .description(
      // i18n: cli.command.validate.description
      '只预检',
    )
    .option(
      '--for <target>',
      // i18n: cli.command.validate.for
      '预检对象',
    )
    .action(async (options: { for?: string; cwd?: string; file?: string }) => {
      console.log(
        await validateOnline({
          cwd: resolveCwd(options.cwd),
          file: options.file,
          forTarget: options.for,
        }),
      );
    });
  return command;
}
