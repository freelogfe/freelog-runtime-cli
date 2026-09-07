/** `policy apply` 命令：--from-file 传策略文本或 JSON，调 domain/policy。 */

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { applyPolicy } from '../../domain/policy/list';

/** policy apply 命令装配（--from-file，付费文本在域层被拒）。 */
export function createPolicyApplyCommand(): Command {
  const command = addSharedOptions(new Command('apply'));
  command
    .description(
      // i18n: cli.command.policy.apply.description
      '从本地文件追加策略',
    )
    .option(
      '--from-file <path>',
      // i18n: cli.command.policy.apply.from_file
      '策略文本路径',
    )
    .action(async function(this: Command, options: { fromFile?: string; file?: string; cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      if (!options.fromFile) {
        // i18n: cli.policy.from_file_required
        throw new CliError('请提供 --from-file', 'POLICY_FROM_FILE');
      }
      const text = readFileSync(options.fromFile, 'utf8');
      await applyPolicy({
        cwd: resolveCwd(options.cwd),
        file: options.file,
        policyName: 'from-file',
        policyText: text,
      });
    });
  return command;
}
