/** `create` 命令：建壳入口，交互收齐 title/type/name 后调 domain/create。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
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
    }) {
      const shared = readSharedOptions(this);
      const record = await createResource({
        cwd: resolveCwd(shared.cwd),
        title: options.title,
        type: options.type,
        name: options.name,
        file: shared.file,
        yes: shared.yes,
      });
      console.log(record.resourceId ?? '');
    });
  return command;
}
