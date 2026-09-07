/** `init` 命令：本地立项（scaffold none/runtime），不碰平台。 */

import { Command } from 'commander';
import { addLeafSubcommand, addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { initProject, type ScaffoldKind } from '../../domain/init/scaffold';

function parseScaffold(raw: unknown): ScaffoldKind {
  if (raw === 'runtime' || raw === 'package' || raw === 'none' || raw === 'collection') {
    return raw;
  }
  return 'none';
}

export function createInitCommand(): Command {
  const init = addSharedOptions(new Command('init'));
  init
    .description(
      // i18n: cli.command.init.description
      '只建本地工程',
    )
    .argument(
      '[dir]',
      // i18n: cli.command.init.dir
      '目标目录',
    )
    .option(
      '--scaffold <kind>',
      // i18n: cli.command.init.scaffold
      '模板种类：runtime / package / none',
    )
    .option(
      '--resource-type <code>',
      // i18n: cli.command.init.resource_type
      '叶子类型编号',
    )
    .action(function(this: Command, dir: string | undefined, options: {
      scaffold?: string;
      resourceType?: string;
      yes?: boolean;
      cwd?: string;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      initProject({
        cwd: resolveCwd(options.cwd),
        dir,
        scaffold: parseScaffold(options.scaffold),
        typeCode: options.resourceType,
        yes: options.yes,
      });
    });

  addLeafSubcommand(
    init,
    'theme',
    // i18n: cli.command.init.theme.description
    '主题工程',
  )
    .option(
      '--template <id>',
      // i18n: cli.command.init.theme.template
      '模板编号',
    )
    .action(function(this: Command, options: { template?: string; yes?: boolean; cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      initProject({
        cwd: resolveCwd(options.cwd),
        scaffold: 'runtime',
        shortcut: 'theme',
        template: options.template,
        yes: options.yes,
      });
    });

  addLeafSubcommand(
    init,
    'widget',
    // i18n: cli.command.init.widget.description
    '插件工程',
  )
    .option(
      '--template <id>',
      // i18n: cli.command.init.widget.template
      '模板编号',
    )
    .action(function(this: Command, options: { template?: string; yes?: boolean; cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      initProject({
        cwd: resolveCwd(options.cwd),
        scaffold: 'runtime',
        shortcut: 'widget',
        template: options.template,
        yes: options.yes,
      });
    });

  addLeafSubcommand(
    init,
    'package',
    // i18n: cli.command.init.package.description
    '前端库或软件库工程',
  )
    .option(
      '--template <id>',
      // i18n: cli.command.init.package.template
      '模板编号',
    )
    .option(
      '--namespace <ns>',
      // i18n: cli.command.init.package.namespace
      '包命名空间',
    )
    .action(function(this: Command, options: {
      template?: string;
      namespace?: string;
      yes?: boolean;
      cwd?: string;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      initProject({
        cwd: resolveCwd(options.cwd),
        scaffold: 'package',
        shortcut: 'package',
        template: options.template,
        namespace: options.namespace,
        yes: options.yes,
      });
    });

  return init;
}
