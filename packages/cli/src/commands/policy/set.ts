/** `policy set`：明确启用或停用资源自身的一条策略。 */

import { confirm } from '@inquirer/prompts';
import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { setPolicy } from '../../domain/policy/list';

/** 装配策略启用和停用命令，方向必须显式。 */
export function createPolicySetCommand(): Command {
  const command = addSharedOptions(new Command('set'));
  command.description('启用或停用策略')
    .requiredOption('--id <policyId>', '策略编号')
    .option('--on', '启用')
    .option('--off', '停用')
    .action(async function (this: Command, options: { id: string; on?: boolean; off?: boolean }) {
      const shared = readSharedOptions(this);
      const yes = shared.yes === true;
      if (options.on === options.off) throw new CliError('必须且只能提供 --on 或 --off', 'POLICY_SET_DIRECTION');
      if (!yes && !await confirm({ message: `${options.on ? '启用' : '停用'}策略 ${options.id}？`, default: true })) return;
      await setPolicy({ cwd: resolveCwd(shared.cwd), file: shared.file, policyId: options.id, on: options.on === true });
      console.log(`已${options.on ? '启用' : '停用'}授权策略`);
    });
  return command;
}
