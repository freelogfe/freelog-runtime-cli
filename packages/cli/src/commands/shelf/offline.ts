import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { offlineResource } from '../../domain/online/online';

export function createOfflineCommand(): Command {
  const command = addSharedOptions(new Command('offline'));
  command
    .description(
      // i18n: cli.command.offline.description
      '下架',
    )
    .action(async (options: { cwd?: string; file?: string }) => {
      await offlineResource({
        cwd: resolveCwd(options.cwd),
        file: options.file,
      });
    });
  return command;
}
