/** `policy set` 命令：按 policyId 开/关策略。 */

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
    .action(async function(this: Command, options: {
      id?: string;
      on?: boolean;
      off?: boolean;
      file?: string;
      cwd?: string;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
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
