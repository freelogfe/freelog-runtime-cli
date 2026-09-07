import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { optionAdd, optionList, optionRm, optionSet } from '../../domain/version/form/option';

export function createVersionOptionCommand(): Command {
  const option = addSharedOptions(new Command('option'));
  option.description(
    // i18n: cli.command.version.option.description
    '改稿上的可选配置',
  );

  addSharedOptions(option.command('add'))
    .description(
      // i18n: cli.command.version.option.add.description
      '加可选配置',
    )
    .argument('[line]', '一行式')
    .action(async function(this: Command, line: string | undefined, options: { file?: string; cwd?: string; yes?: boolean }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(await optionAdd(resolveCwd(options.cwd), {
        line,
        file: options.file,
        yes: options.yes,
      }));
    });

  addSharedOptions(option.command('set'))
    .description(
      // i18n: cli.command.version.option.set.description
      '改可选配置',
    )
    .argument('[line]', '一行式')
    .action(async function(this: Command, line: string | undefined, options: { file?: string; cwd?: string; yes?: boolean }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(await optionSet(resolveCwd(options.cwd), {
        line,
        file: options.file,
        yes: options.yes,
      }));
    });

  addSharedOptions(option.command('rm'))
    .description(
      // i18n: cli.command.version.option.rm.description
      '删可选配置',
    )
    .argument('<key>', '键')
    .action(function(this: Command, key: string, options: { file?: string; cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(optionRm(resolveCwd(options.cwd), key, options.file));
    });

  addSharedOptions(option.command('list'))
    .description(
      // i18n: cli.command.version.option.list.description
      '列可选配置',
    )
    .action(function(this: Command, options: { file?: string; cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(optionList(resolveCwd(options.cwd), options.file));
    });

  return option;
}
