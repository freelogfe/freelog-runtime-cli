/** `policy list`：当前资源自身的全部授权策略，不做分页。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { formatPolicyList, getPolicyList } from '../../domain/policy/list';

/** policy list 命令装配。 */
export function createPolicyListCommand(): Command {
  const command = addSharedOptions(new Command('list'));
  command
    .description(
      // i18n: cli.command.policy.list.description
      '查看当前资源的全部授权策略及资源类型层级',
    )
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      const list = await getPolicyList({
        cwd: resolveCwd(shared.cwd),
        file: shared.file,
      });
      console.log(formatPolicyList(list));
    });
  return command;
}
