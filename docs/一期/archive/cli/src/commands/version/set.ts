/** `version set` 命令：只改 N.json.filePath 记录，不打 zip、不上传。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { setIdentityFilePath } from '../../domain/version/setPath';

/** version set 命令装配（只改 filePath 记录）。 */
export function createVersionSetCommand(): Command {
  const command = addSharedOptions(new Command('set'));
  command
    .description(
      // i18n: cli.command.version.set.description
      '只改记录的本地路径',
    )
    .option(
      '--artifact <path>',
      // i18n: cli.command.version.artifact
      '要记录的新本地文件或目录',
    )
    .action(function(this: Command, options: { artifact?: string }) {
      const shared = readSharedOptions(this);
      const updated = setIdentityFilePath(resolveCwd(shared.cwd), {
        file: shared.file,
        artifact: options.artifact,
      });
      console.log(updated.filePath ?? '');
    });
  return command;
}
