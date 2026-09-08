/** `offline` 命令：下架（status=4），不要求策略。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { offlineResource } from '../../domain/online/online';

/** offline 命令装配（status=4）。 */
export function createOfflineCommand(): Command {
  const command = addSharedOptions(new Command('offline'));
  command
    .description(
      // i18n: cli.command.offline.description
      '下架',
    )
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      await offlineResource({
        cwd: resolveCwd(shared.cwd),
        file: shared.file,
      });
    });
  return command;
}
