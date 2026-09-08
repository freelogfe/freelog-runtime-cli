/** `validate --for online` 命令：逐条打印上架预检结果，失败退出码非 0。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { validateOnline } from '../../domain/online/validate';

/** validate 命令装配（--for online）。 */
export function createValidateCommand(): Command {
  const command = addSharedOptions(new Command('validate'));
  command
    .description(
      // i18n: cli.command.validate.description
      '只预检',
    )
    .option(
      '--for <target>',
      // i18n: cli.command.validate.for
      '预检对象',
    )
    .action(async function(this: Command, options: { for?: string }) {
      const shared = readSharedOptions(this);
      console.log(
        await validateOnline({
          cwd: resolveCwd(shared.cwd),
          file: shared.file,
          forTarget: options.for,
        }),
      );
    });
  return command;
}
