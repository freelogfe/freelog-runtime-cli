/** `version attr add/set/rm/list` 命令：属性编辑入口，规则在 domain/version/form/attr。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { attrAdd, attrList, attrRm, attrSet } from '../../domain/version/form/attr';

/** version attr add/set/rm/list 命令装配。 */
export function createVersionAttrCommand(): Command {
  const attr = addSharedOptions(new Command('attr'));
  attr.description(
    // i18n: cli.command.version.attr.description
    '改稿上的属性',
  );

  addSharedOptions(attr.command('add'))
    .description(
      // i18n: cli.command.version.attr.add.description
      '加自定义属性',
    )
    .argument('[line]', '一行式')
    .action(async function(this: Command, line: string | undefined, options: { file?: string; cwd?: string; yes?: boolean }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(await attrAdd(resolveCwd(options.cwd), { line, file: options.file, yes: options.yes }));
    });

  addSharedOptions(attr.command('set'))
    .description(
      // i18n: cli.command.version.attr.set.description
      '改属性',
    )
    .argument('[line]', '一行式')
    .action(async function(this: Command, line: string | undefined, options: { file?: string; cwd?: string; yes?: boolean }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(await attrSet(resolveCwd(options.cwd), { line, file: options.file, yes: options.yes }));
    });

  addSharedOptions(attr.command('rm'))
    .description(
      // i18n: cli.command.version.attr.rm.description
      '删自定义属性',
    )
    .argument('<key>', '键')
    .action(function(this: Command, key: string, options: { file?: string; cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(attrRm(resolveCwd(options.cwd), key, options.file));
    });

  addSharedOptions(attr.command('list'))
    .description(
      // i18n: cli.command.version.attr.list.description
      '列稿上的属性',
    )
    .action(function(this: Command, options: { file?: string; cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(attrList(resolveCwd(options.cwd), options.file));
    });

  return attr;
}
