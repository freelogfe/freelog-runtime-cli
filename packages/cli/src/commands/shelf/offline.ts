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
      const result = await offlineResource({
        cwd: resolveCwd(shared.cwd),
        file: shared.file,
        yes: shared.yes,
        json: shared.json,
      });
      console.log(shared.json ? JSON.stringify(result) : result.changed ? '已下架（状态已核验）' : result.status === 0 ? '当前未上架' : '已是下架');
    });
  return command;
}
