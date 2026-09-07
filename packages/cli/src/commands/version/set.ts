import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { setIdentityFilePath } from '../../domain/version/setPath';

export function createVersionSetCommand(): Command {
  const command = addSharedOptions(new Command('set'));
  command
    .description(
      // i18n: cli.command.version.set.description
      '只改记录的本地路径',
    )
    .action((options: { file?: string; cwd?: string }) => {
      const updated = setIdentityFilePath(resolveCwd(options.cwd), options.file ?? '');
      console.log(updated.filePath ?? '');
    });
  return command;
}
