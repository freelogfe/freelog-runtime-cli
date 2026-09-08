/** `policy list` 命令：列已有策略（启用在前）。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { listPolicies } from '../../domain/policy/list';

/** policy list 命令装配。 */
export function createPolicyListCommand(): Command {
  const command = addSharedOptions(new Command('list'));
  command
    .description(
      // i18n: cli.command.policy.list.description
      '看已有策略',
    )
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      console.log(await listPolicies({
        cwd: resolveCwd(shared.cwd),
        file: shared.file,
      }));
    });
  return command;
}
