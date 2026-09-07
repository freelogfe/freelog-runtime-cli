/** `update-version` 命令：发新号（--version 或 --bump 定号）。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { runUpdateVersion } from '../../domain/version/updateVersion';

/** update-version 命令装配（--version|--bump，须 > latest）。 */
export function createUpdateVersionCommand(): Command {
  const command = addSharedOptions(new Command('update-version'));
  command
    .description(
      // i18n: cli.command.update_version.description
      '定新号并提交',
    )
    .option(
      '--reuse-version <ver>',
      // i18n: cli.command.update_version.reuse_version
      '这次提交认的底',
    )
    .option(
      '--version <ver>',
      // i18n: cli.command.update_version.version
      '新号',
    )
    .option(
      '--bump <level>',
      // i18n: cli.command.update_version.bump
      '按 patch / minor / major 递增',
    )
    .option(
      '--reset',
      // i18n: cli.command.update_version.reset
      '丢掉再按回显源拉',
    )
    .action(async function(this: Command, options: {
      reuseVersion?: string;
      version?: string;
      bump?: string;
      reset?: boolean;
      yes?: boolean;
      file?: string;
      cwd?: string;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      const result = await runUpdateVersion({
        cwd: resolveCwd(options.cwd),
        file: options.file,
        version: options.version,
        bump: options.bump,
        reuseVersion: options.reuseVersion,
        reset: options.reset,
        yes: options.yes,
      });
      console.log(result);
    });
  return command;
}
