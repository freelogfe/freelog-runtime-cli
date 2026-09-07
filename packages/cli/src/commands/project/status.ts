import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { statusProject } from '../../domain/status';

export function createStatusCommand(): Command {
  const command = addSharedOptions(new Command('status'));
  command
    .description(
      // i18n: cli.command.status.description
      '只打印线上和本地现状',
    )
    .action(async (options: { cwd?: string; file?: string }) => {
      const text = await statusProject({
        cwd: resolveCwd(options.cwd),
        file: options.file,
      });
      console.log(text);
    });
  return command;
}
