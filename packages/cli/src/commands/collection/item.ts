/** collection item 命令装配。 */

import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import {
  addCollectionDraftItems,
  collectionDraftAuthStatus,
  listCollectionDraftItems,
  moveCollectionDraftItem,
  removeCollectionDraftItems,
  renameCollectionDraftItem,
  sortCollectionDraftItems,
} from '../../domain/collection/items';
import { addCollectionOptions } from './options';

/** 装配合集服务端目录草稿维护命令。 */
export function createCollectionItemCommand(): Command {
  const item = addCollectionOptions(new Command('item')).description('管理合集服务端目录草稿');
  addCollectionOptions(item.command('list'))
    .description('列出目录草稿单品')
    .option('--search <text>', '按单品关键字筛选')
    .action(async function(this: Command, options: { search?: string }) {
      const shared = readSharedOptions(this);
      const items = await listCollectionDraftItems({ cwd: resolveCwd(shared.cwd), selector: shared.file, search: options.search });
      console.log(items.map((entry) => [entry.itemId, entry.resourceId, entry.itemTitle, entry.resourceName ?? ''].join('\t')).join('\n'));
    });
  addCollectionOptions(item.command('add'))
    .description('将线上本人已上架单资源加入目录草稿')
    .argument('<source...>', '单资源 id:<id> 或 name:<username/name>')
    .option('--policy <upstream-id=policy-id>', '为未授权上游资源显式选择策略，可重复', (value: string, previous: string[] = []) => [...previous, value], [])
    .action(async function(this: Command, sources: string[], options: { policy?: string[] }) {
      const shared = readSharedOptions(this);
      const policyBySubject: Record<string, string> = {};
      for (const entry of options.policy ?? []) {
        const separator = entry.indexOf('=');
        if (separator <= 0 || !entry.slice(separator + 1).trim()) throw new CliError('--policy 必须为 <upstream-id>=<policy-id>', 'COLLECTION_ITEM_POLICY_INVALID');
        policyBySubject[entry.slice(0, separator).trim()] = entry.slice(separator + 1).trim();
      }
      const result = await addCollectionDraftItems({
        cwd: resolveCwd(shared.cwd), selector: shared.file, sources, yes: shared.yes, policyBySubject,
      });
      console.log(`已添加：${result.added.join('、') || '无'}；未变更：${result.unchanged.join('、') || '无'}`);
    });
  addCollectionOptions(item.command('rename'))
    .description('修改目录草稿中的单品标题')
    .argument('<item-id>', '目录单品 itemId')
    .requiredOption('--title <text>', '新的单品标题')
    .action(async function(this: Command, itemId: string, options: { title: string }) {
      const shared = readSharedOptions(this);
      await renameCollectionDraftItem({ cwd: resolveCwd(shared.cwd), selector: shared.file, itemId, title: options.title, yes: shared.yes });
    });
  addCollectionOptions(item.command('remove'))
    .description('从目录草稿移除单品，不删除来源资源')
    .argument('<item-id...>', '目录单品 itemId')
    .action(async function(this: Command, itemIds: string[]) {
      const shared = readSharedOptions(this);
      await removeCollectionDraftItems({ cwd: resolveCwd(shared.cwd), selector: shared.file, itemIds, yes: shared.yes });
    });
  addCollectionOptions(item.command('move'))
    .description('移动目录草稿中单品的位置')
    .argument('<item-id>', '要移动的目录单品 itemId')
    .option('--before <item-id>', '移动到指定单品之前')
    .option('--after <item-id>', '移动到指定单品之后')
    .action(async function(this: Command, itemId: string, options: { before?: string; after?: string }) {
      const shared = readSharedOptions(this);
      await moveCollectionDraftItem({
        cwd: resolveCwd(shared.cwd), selector: shared.file, itemId, before: options.before, after: options.after, yes: shared.yes,
      });
    });
  addCollectionOptions(item.command('sort'))
    .description('按字段重新排序目录草稿')
    .requiredOption('--by <field>', 'added、title 或 resource-updated')
    .option('--asc', '升序')
    .option('--desc', '降序')
    .action(async function(this: Command, options: { by: string; asc?: boolean; desc?: boolean }) {
      if (options.by !== 'added' && options.by !== 'title' && options.by !== 'resource-updated') {
        throw new CliError('--by 仅支持 added、title 或 resource-updated', 'COLLECTION_ITEM_SORT_FIELD');
      }
      if (Boolean(options.asc) === Boolean(options.desc)) {
        throw new CliError('必须且只能提供 --asc 或 --desc', 'COLLECTION_ITEM_SORT_DIRECTION');
      }
      const shared = readSharedOptions(this);
      const sorted = await sortCollectionDraftItems({
        cwd: resolveCwd(shared.cwd), selector: shared.file, by: options.by, direction: options.asc ? 'asc' : 'desc', yes: shared.yes,
      });
      console.log(sorted.map((entry) => [entry.itemId, entry.resourceId, entry.itemTitle, entry.resourceName ?? ''].join('\t')).join('\n'));
    });
  const auth = addCollectionOptions(item.command('auth')).description('查询或处理目录草稿单品授权');
  addCollectionOptions(auth.command('status'))
    .description('查询指定目录单品的授权状态，只读')
    .argument('<item-id...>', '目录单品 itemId')
    .action(async function(this: Command, itemIds: string[]) {
      const shared = readSharedOptions(this);
      const statuses = await collectionDraftAuthStatus({ cwd: resolveCwd(shared.cwd), selector: shared.file, itemIds });
      console.log(statuses.map((entry) => `${entry.itemId}\t${entry.isAuth ? '已授权' : '未授权'}`).join('\n'));
    });
  return item;
}
