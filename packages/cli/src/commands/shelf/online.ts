import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { onlineResource } from '../../domain/online/online';

export function createOnlineCommand(): Command {
  const command = addSharedOptions(new Command('online'));
  command
    .description(
      // i18n: cli.command.online.description
      '上架',
    )
    .action(async (options: { cwd?: string; file?: string }) => {
      await onlineResource({
        cwd: resolveCwd(options.cwd),
        file: options.file,
      });
    });
  return command;
}
