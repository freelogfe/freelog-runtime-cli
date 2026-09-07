import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { listPolicies } from '../../domain/policy/list';

export function createPolicyListCommand(): Command {
  const command = addSharedOptions(new Command('list'));
  command
    .description(
      // i18n: cli.command.policy.list.description
      '看已有策略',
    )
    .action(async (options: { cwd?: string; file?: string }) => {
      console.log(await listPolicies({
        cwd: resolveCwd(options.cwd),
        file: options.file,
      }));
    });
  return command;
}
