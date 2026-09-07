/** `create` 命令：建壳入口，交互收齐 title/type/name 后调 domain/create。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { createResource } from '../../domain/create/create';

/** create 命令装配（建资源壳）。 */
export function createCreateCommand(): Command {
  const command = addSharedOptions(new Command('create'));
  command
    .description(
      // i18n: cli.command.create.description
      '只建新壳',
    )
    .option(
      '--title <title>',
      // i18n: cli.command.create.title
      '标题',
    )
    .option(
      '--type <type>',
      // i18n: cli.command.create.type
      '资源类型',
    )
    .option(
      '--name <name>',
      // i18n: cli.command.create.name
      '授权标识',
    )
    .action(async function(this: Command, options: {
      title?: string;
      type?: string;
      name?: string;
      file?: string;
      yes?: boolean;
      cwd?: string;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      const record = await createResource({
        cwd: resolveCwd(options.cwd),
        title: options.title,
        type: options.type,
        name: options.name,
        file: options.file,
        yes: options.yes,
      });
      console.log(record.resourceId ?? '');
    });
  return command;
}
