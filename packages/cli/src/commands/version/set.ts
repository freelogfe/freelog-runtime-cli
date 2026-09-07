import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { setIdentityFilePath } from '../../domain/version/setPath';

export function createVersionSetCommand(): Command {
  const command = addSharedOptions(new Command('set'));
  command
    .description(
      // i18n: cli.command.version.set.description
      '只改记录的本地路径',
    )
    .action(function(this: Command, options: { file?: string; cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      const updated = setIdentityFilePath(resolveCwd(options.cwd), options.file ?? '');
      console.log(updated.filePath ?? '');
    });
  return command;
}
