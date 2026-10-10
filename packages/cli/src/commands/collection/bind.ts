/** collection bind 命令装配。 */

import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { bindCollection } from '../../domain/collection/bind';
import { addCollectionOptions } from './options';

/** 装配将线上合集接入本地身份的命令。 */
export function createCollectionBindCommand(): Command {
  return addCollectionOptions(new Command('bind'))
    .description('将线上本人合集接入本地身份，不关联文件')
    .argument('<target>', '合集 id 或 username/name')
    .action(async function(this: Command, target: string) {
      const shared = readSharedOptions(this);
      const identity = await bindCollection({ cwd: resolveCwd(shared.cwd), target });
      console.log(`${identity.n}.json`);
    });
}
