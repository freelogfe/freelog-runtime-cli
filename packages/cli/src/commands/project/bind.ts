/** `bind` 命令：接入已有线上资源为本地身份（不拉版本表单）。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { bindResource } from '../../domain/bind/bind';

/** bind 命令装配。 */
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
    .option('--artifact <path>', '记录默认的本地文件或构建目录，不上传')
    .action(async function(this: Command, target: string, options: {
      force?: boolean;
      artifact?: string;
      yes?: boolean;
      cwd?: string;
    }) {
      const shared = readSharedOptions(this);
      await bindResource({
        cwd: resolveCwd(shared.cwd),
        target,
        file: options.artifact,
        force: options.force,
        yes: shared.yes,
      });
      // i18n: cli.bind.success
      console.log('bind 成功，可用 status 查看');
    });
  return command;
}
