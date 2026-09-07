/** `create-version` 命令：首版备稿（--prepare）/ 提交（--yes）。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { runCreateVersion } from '../../domain/version/createVersion';

export function createCreateVersionCommand(): Command {
  const command = addSharedOptions(new Command('create-version'));
  command
    .description(
      // i18n: cli.command.create_version.description
      '提交首版',
    )
    .option(
      '--prepare',
      // i18n: cli.command.create_version.prepare
      '只备稿，不提交',
    )
    .option(
      '--reset',
      // i18n: cli.command.create_version.reset
      '丢掉工作稿重来',
    )
    .action(async function(this: Command, options: {
      prepare?: boolean;
      reset?: boolean;
      yes?: boolean;
      file?: string;
      cwd?: string;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      const result = await runCreateVersion({
        cwd: resolveCwd(options.cwd),
        file: options.file,
        prepare: options.prepare,
        reset: options.reset,
        yes: options.yes,
      });
      console.log(result);
    });
  return command;
}
