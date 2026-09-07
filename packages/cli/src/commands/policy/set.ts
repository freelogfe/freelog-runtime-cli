import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { setPolicy } from '../../domain/policy/list';

export function createPolicySetCommand(): Command {
  const command = addSharedOptions(new Command('set'));
  command
    .description(
      // i18n: cli.command.policy.set.description
      '启用或停用策略',
    )
    .option('--id <policyId>', '策略编号')
    .option('--on', '启用')
    .option('--off', '停用')
    .action(async (options: {
      id?: string;
      on?: boolean;
      off?: boolean;
      file?: string;
      cwd?: string;
    }) => {
      if (!options.id) {
        // i18n: cli.policy.id_required
        throw new CliError('请提供 --id', 'POLICY_ID_REQUIRED');
      }
      await setPolicy({
        cwd: resolveCwd(options.cwd),
        file: options.file,
        policyId: options.id,
        on: options.on && !options.off,
      });
    });
  return command;
}
