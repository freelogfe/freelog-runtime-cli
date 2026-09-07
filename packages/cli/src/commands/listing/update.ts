import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { updateListing } from '../../domain/listing/update';

export function createUpdateCommand(): Command {
  const command = addSharedOptions(new Command('update'));
  command
    .description(
      // i18n: cli.command.update.description
      '只改标题简介封面标签',
    )
    .option('--title <title>', '标题')
    .option('--intro <intro>', '简介')
    .option('--cover <path>', '封面')
    .option('--tags <tags>', '标签')
    .action(async function(this: Command, options: {
      title?: string;
      intro?: string;
      cover?: string;
      tags?: string;
      yes?: boolean;
      file?: string;
      cwd?: string;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      await updateListing({
        cwd: resolveCwd(options.cwd),
        file: options.file,
        title: options.title,
        intro: options.intro,
        cover: options.cover,
        tags: options.tags,
        yes: options.yes,
      });
    });
  return command;
}
