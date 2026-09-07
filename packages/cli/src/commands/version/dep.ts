/** `version dep add/rm/range/list` 命令：依赖编辑入口，签约规则在 domain/version/form/dep。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { depAdd, depList, depRange, depRm } from '../../domain/version/form/dep';

/** version dep add/rm/range/list 命令装配。 */
export function createVersionDepCommand(): Command {
  const dep = addSharedOptions(new Command('dep'));
  dep.description(
    // i18n: cli.command.version.dep.description
    '改稿上的依赖',
  );

  addSharedOptions(dep.command('add'))
    .description(
      // i18n: cli.command.version.dep.add.description
      '加依赖',
    )
    .argument('<resourceId>', '依赖资源 id')
    .option('--range <range>', '版本范围')
    .action(async function(this: Command, resourceId: string, options: {
      range?: string;
      file?: string;
      cwd?: string;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      const id = await depAdd({
        cwd: resolveCwd(options.cwd),
        resourceId,
        versionRange: options.range,
        file: options.file,
      });
      console.log(id);
    });

  addSharedOptions(dep.command('list'))
    .description(
      // i18n: cli.command.version.dep.list.description
      '列依赖',
    )
    .action(function(this: Command, options: { file?: string; cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(depList(resolveCwd(options.cwd), options.file));
    });

  addSharedOptions(dep.command('rm'))
    .description(
      // i18n: cli.command.version.dep.rm.description
      '删依赖',
    )
    .argument('<resourceId>', '依赖资源 id')
    .action(function(this: Command, resourceId: string, options: { file?: string; cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(depRm(resolveCwd(options.cwd), resourceId, options.file));
    });

  addSharedOptions(dep.command('range'))
    .description(
      // i18n: cli.command.version.dep.range.description
      '改依赖版本范围',
    )
    .argument('<resourceId>', '依赖资源 id')
    .option('--range <range>', '版本范围')
    .action(async function(this: Command, resourceId: string, options: {
      range?: string;
      file?: string;
      cwd?: string;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      if (!options.range) {
        // i18n: cli.dep.range_required
        throw new CliError('请提供 --range', 'DEP_RANGE_REQUIRED');
      }
      console.log(await depRange(resolveCwd(options.cwd), resourceId, options.range, options.file));
    });

  return dep;
}
