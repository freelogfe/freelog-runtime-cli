import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { updateOnlineDescription } from '../../domain/version/description';

export function createVersionDescriptionCommand(): Command {
  const command = addSharedOptions(new Command('description'));
  command
    .description(
      // i18n: cli.command.version.description.description
      '改线上已发号描述',
    )
    .option(
      '--version <ver>',
      // i18n: cli.command.version.description.version
      '已发号',
    )
    .option(
      '--description <text>',
      // i18n: cli.command.version.description.text
      '描述',
    )
    .action(async function(this: Command, options: {
      version?: string;
      description?: string;
      file?: string;
      cwd?: string;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      if (options.description === undefined) {
        // i18n: cli.description.text_required
        throw new CliError('请提供 --description', 'DESCRIPTION_REQUIRED');
      }
      const version = await updateOnlineDescription({
        cwd: resolveCwd(options.cwd),
        file: options.file,
        version: options.version,
        description: options.description,
      });
      console.log(version);
    });
  return command;
}
