/** collection item 命令装配。 */

import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import {
  addCollectionDraftItems,
  selectCollectionItemSources,
  collectionDraftAuthStatus,
  listCollectionDraftItems,
  moveCollectionDraftItem,
  removeCollectionDraftItems,
  renameCollectionDraftItem,
  sortCollectionDraftItems,
} from '../../domain/collection/items';
import { addCollectionOptions } from './options';
import { collectionItemAddSummary } from '../../domain/collection/itemAddResult';

/** 输出转义而不是修改业务数据，避免线上标题伪造终端行/列或控制序列。 */
function itemRowsOutput(rows: Awaited<ReturnType<typeof listCollectionDraftItems>>): string {
  const cell = (value: string) => value.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu,
    (char) => char.split('').map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));
  return rows.map((row) => [row.itemId, row.resourceId, row.itemTitle, row.resourceName ?? ''].map(cell).join('\t')).join('\n');
}

/** 装配合集服务端目录草稿维护命令。 */
export function createCollectionItemCommand(): Command {
  const item = addCollectionOptions(new Command('item')).description('管理合集服务端目录草稿');
  addCollectionOptions(item.command('list'))
    .description('列出目录草稿单品')
    .option('--search <text>', '按单品关键字筛选')
    .action(async function(this: Command, options: { search?: string }) {
      const shared = readSharedOptions(this);
      const items = await listCollectionDraftItems({ cwd: resolveCwd(shared.cwd), selector: shared.file, search: options.search });
      console.log(itemRowsOutput(items));
    });
  addCollectionOptions(item.command('add'))
    .description('将线上本人已上架单资源加入目录草稿')
    .argument('[source...]', '单资源 id:<id> 或 name:<username/name>；省略时TTY从线上资源库选择')
    .action(async function(this: Command, sources: string[] = []) {
      const shared = readSharedOptions(this);
      const cwd = resolveCwd(shared.cwd);
      const selection = sources.length ? undefined : await selectCollectionItemSources({ cwd, selector: shared.file, json: shared.json });
      const result = await addCollectionDraftItems({
        cwd, selector: selection ? `id:${selection.resourceId}` : shared.file, sources: selection?.sources ?? sources, yes: shared.yes,
      });
      const summary = collectionItemAddSummary(result);
      if (result.failed.length) throw new CliError(summary, 'COLLECTION_ITEM_ADD_PARTIAL');
      console.log(summary);
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
      const moved = await moveCollectionDraftItem({
        cwd: resolveCwd(shared.cwd), selector: shared.file, itemId, before: options.before, after: options.after, yes: shared.yes,
      });
      console.log(itemRowsOutput(moved));
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
      console.log(itemRowsOutput(sorted));
    });
  const auth = addCollectionOptions(item.command('auth')).description('查询或处理目录草稿单品授权');
  addCollectionOptions(auth.command('status'))
    .description('查询指定目录单品的授权状态，只读')
    .argument('<item-id...>', '目录单品 itemId')
    .action(async function(this: Command, itemIds: string[]) {
      const shared = readSharedOptions(this);
      const statuses = await collectionDraftAuthStatus({ cwd: resolveCwd(shared.cwd), selector: shared.file, itemIds });
      console.log(statuses.map((entry) => `${entry.itemId}\t${entry.resourceId}\t${entry.isAuth ? '已授权' : '未授权'}`).join('\n'));
    });
  return item;
}
