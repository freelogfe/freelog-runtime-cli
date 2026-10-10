/** `status` 命令：本地身份 + 工作稿 + 线上 latest 一览，只读。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { statusProject } from '../../domain/status';

/** status 命令装配。 */
export function createStatusCommand(): Command {
  const command = addSharedOptions(new Command('status'));
  command
    .description(
      // i18n: cli.command.status.description
      '只打印线上和本地现状',
    )
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      const text = await statusProject({
        cwd: resolveCwd(shared.cwd),
        file: shared.file,
      });
      console.log(text);
    });
  return command;
}
