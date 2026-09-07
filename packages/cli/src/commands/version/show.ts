import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { showLocal, showOnline } from '../../domain/version/show';

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
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      const cwd = resolveCwd(options.cwd);
      if (options.local && options.version) {
        // i18n: cli.show.local_conflict
        throw new CliError('--local 不能与 --version 一起用', 'SHOW_LOCAL_CONFLICT');
      }
      if (options.local) {
        console.log(showLocal(cwd, options.file));
        return;
      }
      console.log(
        await showOnline({
          cwd,
          file: options.file,
          version: options.version,
        }),
      );
    });
  return command;
}
