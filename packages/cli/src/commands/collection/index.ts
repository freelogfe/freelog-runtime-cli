/** 合集命令组。后续子命令必须只调用 domain/collection，不能接入单资源领域模块。 */

import { Command } from 'commander';
import { createCollectionCreateCommand } from './create';
import { createCollectionBindCommand } from './bind';
import { createCollectionItemCommand } from './item';
import { addCollectionOptions } from './options';

/** 装配合集顶层命令组。 */
export function createCollectionCommand(): Command {
  const collection = addCollectionOptions(new Command('collection')).description('合集管理');
  collection.addCommand(createCollectionCreateCommand());
  collection.addCommand(createCollectionBindCommand());
  collection.addCommand(createCollectionItemCommand());
  return collection;
}
