/** `version show` 命令：线上号详情 / --local 本地稿，只读。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { showLocal, showOnline } from '../../domain/version/show';

/** version show 命令装配（--local 稿 / 线上号）。 */
export function createVersionShowCommand(): Command {
  const command = addSharedOptions(new Command('show'));
  command
    .description(
      // i18n: cli.command.version.show.description
      '只读查看',
    )
    .option(
      '--version <ver>',
      // i18n: cli.command.version.show.version
      '已发号',
    )
    .option(
      '--local',
      // i18n: cli.command.version.show.local
      '只看本地工作稿',
    )
    .action(async function(this: Command, options: {
      version?: string;
      local?: boolean;
      file?: string;
      cwd?: string;
    }) {
      const shared = readSharedOptions(this);
      const cwd = resolveCwd(shared.cwd);
      if (options.local && options.version) {
        // i18n: cli.show.local_conflict
        throw new CliError('--local 不能与 --version 一起用', 'SHOW_LOCAL_CONFLICT');
      }
      if (options.local) {
        console.log(showLocal(cwd, shared.file));
        return;
      }
      console.log(
        await showOnline({
          cwd,
          file: shared.file,
          version: options.version,
        }),
      );
    });
  return command;
}
