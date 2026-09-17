/** collection create 命令装配：只收集参数并调用合集领域层。 */

import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { createCollection } from '../../domain/collection/create';
import { addCollectionOptions } from './options';

/** 装配仅创建合集壳的命令。 */
export function createCollectionCreateCommand(): Command {
  return addCollectionOptions(new Command('create'))
    .description('创建合集壳，不添加单品、不发布、不上架')
    .option('--type <type>', '合集最终叶子类型编号')
    .option('--title <title>', '合集标题')
    .option('--name <name>', '合集授权标识短段')
    .action(async function(this: Command, options: { type?: string; title?: string; name?: string }) {
      const shared = readSharedOptions(this);
      const identity = await createCollection({
        cwd: resolveCwd(shared.cwd),
        type: options.type,
        title: options.title,
        name: options.name,
        yes: shared.yes,
      });
      console.log(identity.resourceId ?? '');
    });
}
