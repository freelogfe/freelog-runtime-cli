import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { applyPolicy } from '../../domain/policy/list';

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
    .action(async (options: { fromFile?: string; file?: string; cwd?: string }) => {
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
