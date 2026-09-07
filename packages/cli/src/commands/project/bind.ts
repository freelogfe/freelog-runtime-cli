/** `bind` 命令：接入已有线上资源为本地身份（不拉版本表单）。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { bindResource } from '../../domain/bind/bind';

export function createBindCommand(): Command {
  const command = addSharedOptions(new Command('bind'));
  command
    .description(
      // i18n: cli.command.bind.description
      '把线上身份接到本地',
    )
    .argument(
      '<target>',
      // i18n: cli.command.bind.target
      '资源 id 或 username/name',
    )
    .option(
      '--force',
      // i18n: cli.command.bind.force
      '换绑',
    )
    .action(async function(this: Command, target: string, options: {
      force?: boolean;
      file?: string;
      yes?: boolean;
      cwd?: string;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      await bindResource({
        cwd: resolveCwd(options.cwd),
        target,
        file: options.file,
        force: options.force,
        yes: options.yes,
      });
      console.log('bind 成功，可用 status 查看');
    });
  return command;
}
