/** `policy list` 命令：列已有策略（启用在前）。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
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
    .action(async function(this: Command, options: { cwd?: string; file?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(await listPolicies({
        cwd: resolveCwd(options.cwd),
        file: options.file,
      }));
    });
  return command;
}
