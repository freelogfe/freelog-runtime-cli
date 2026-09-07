import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { createResource } from '../../domain/create/create';

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
    .action(async (options: {
      title?: string;
      type?: string;
      name?: string;
      file?: string;
      yes?: boolean;
      cwd?: string;
    }) => {
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
