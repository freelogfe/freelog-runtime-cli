/** 合集独立上下架命令。 */

import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { offlineCollection, onlineCollection } from '../../domain/collection/shelf';
import { addCollectionOptions } from './options';

/** 装配合集独立上架、下架命令。 */
export function createCollectionShelfCommands(): Command[] {
  const online = addCollectionOptions(new Command('online'))
    .description('上架已发布且已有启用合集策略的合集')
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      const result = await onlineCollection({ cwd: resolveCwd(shared.cwd), selector: shared.file, yes: shared.yes });
      console.log(result.changed ? '合集已上架。' : '合集已处于上架状态。');
    });
  const offline = addCollectionOptions(new Command('offline'))
    .description('下架合集；不删除目录、策略、表单或合同')
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      const result = await offlineCollection({ cwd: resolveCwd(shared.cwd), selector: shared.file, yes: shared.yes });
      console.log(result.changed ? '合集已下架。' : '合集已处于下架状态。');
    });
  return [online, offline];
}
