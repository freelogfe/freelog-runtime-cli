/** `version option add/set/rm/list` 命令：可选配置编辑入口。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { optionAdd, optionList, optionRm, optionSet } from '../../domain/version/form/option';

/** version option add/set/rm/list 命令装配。 */
export function createVersionOptionCommand(): Command {
  const option = addSharedOptions(new Command('option'));
  option.description('改稿上的可选配置');

  addSharedOptions(option.command('add'))
    .description('加可选配置')
    .argument('[line]', '一行式')
    .action(async function (this: Command, line: string | undefined) {
      const shared = readSharedOptions(this);
      console.log(await optionAdd(resolveCwd(shared.cwd), {
        line, file: shared.file, yes: shared.yes,
      }));
    });

  addSharedOptions(option.command('set'))
    .description('改可选配置')
    .argument('[line]', '一行式')
    .action(async function (this: Command, line: string | undefined) {
      const shared = readSharedOptions(this);
      console.log(await optionSet(resolveCwd(shared.cwd), {
        line, file: shared.file, yes: shared.yes,
      }));
    });

  addSharedOptions(option.command('rm'))
    .description('删可选配置')
    .argument('<key>', '键')
    .action(function (this: Command, key: string) {
      const shared = readSharedOptions(this);
      console.log(optionRm(resolveCwd(shared.cwd), key, shared.file));
    });

  addSharedOptions(option.command('list'))
    .description('列可选配置')
    .action(function (this: Command) {
      const shared = readSharedOptions(this);
      console.log(optionList(resolveCwd(shared.cwd), shared.file));
    });

  return option;
}
