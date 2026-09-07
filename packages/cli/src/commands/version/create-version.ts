import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { runCreateVersion } from '../../domain/version/createVersion';

export function createCreateVersionCommand(): Command {
  const command = addSharedOptions(new Command('create-version'));
  command
    .description(
      // i18n: cli.command.create_version.description
      '提交首版',
    )
    .option(
      '--prepare',
      // i18n: cli.command.create_version.prepare
      '只备稿，不提交',
    )
    .option(
      '--reset',
      // i18n: cli.command.create_version.reset
      '丢掉工作稿重来',
    )
    .action(async (options: {
      prepare?: boolean;
      reset?: boolean;
      yes?: boolean;
      file?: string;
      cwd?: string;
    }) => {
      const result = await runCreateVersion({
        cwd: resolveCwd(options.cwd),
        file: options.file,
        prepare: options.prepare,
        reset: options.reset,
        yes: options.yes,
      });
      console.log(result);
    });
  return command;
}
