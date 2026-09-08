/** `online` 命令：上架（status=1），前置校验走 domain/online/validate。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { onlineResource } from '../../domain/online/online';

/** online 命令装配（门禁后 status=1）。 */
export function createOnlineCommand(): Command {
  const command = addSharedOptions(new Command('online'));
  command
    .description(
      // i18n: cli.command.online.description
      '上架',
    )
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      await onlineResource({
        cwd: resolveCwd(shared.cwd),
        file: shared.file,
      });
    });
  return command;
}
