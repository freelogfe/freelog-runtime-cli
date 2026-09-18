/** `type list/search/info/pick` 命令：平台资源类型树，找叶子 typeCode。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import {
  formatTypeInfo,
  formatTypeListPage,
  getTypeInfo,
  getTypeHierarchy,
  listLeafTypes,
  searchLeafTypes,
  typeListPage,
  TYPE_LIST_PAGE_SIZE,
  type TypeNode,
} from '../../domain/create/typePick';
import { requireAuth, resolveCwd } from '../../domain/account/login';
import { isInteractive, selectQuestion } from '../../core/tty';

function requireTypeAuth(command: Command): void {
  const shared = readSharedOptions(command);
  requireAuth({ cwd: resolveCwd(shared.cwd) });
}

/** 已加载的类型结果固定 50 条分页，翻页不重复请求平台。 */
async function showTypePages(items: readonly TypeNode[], commandText: string): Promise<void> {
  let page = 1;
  while (true) {
    const current = typeListPage(items, page);
    console.log(formatTypeListPage(current));
    if (!current.hasPrevious && !current.hasNext) return;
    if (!isInteractive()) {
      if (current.hasNext) {
        console.log(`还有 ${current.total - current.page * TYPE_LIST_PAGE_SIZE} 个资源类型；请在交互终端运行 ${commandText} 查看后续页`);
      }
      return;
    }
    const action = await selectQuestion('资源类型列表', [
      ...(current.hasPrevious ? [{ name: '上一页', value: '__previous__' }] : []),
      ...(current.hasNext ? [{ name: '下一页', value: '__next__' }] : []),
      { name: '退出', value: '__exit__' },
    ]);
    if (action === '__exit__') return;
    page += action === '__next__' ? 1 : -1;
  }
}

/** type 命令装配（list/search/info/pick）。 */
export function createTypeCommand(): Command {
  const type = addSharedOptions(new Command('type'));
  type.description(
    // i18n: cli.command.type.description
    '查询可选最终叶子类型',
  );

  addSharedOptions(type.command('list'))
    .description(
      // i18n: cli.command.type.list.description
      '列出最终叶子类型的完整层级路径',
    )
    .action(async function(this: Command) {
      requireTypeAuth(this);
      const items = await listLeafTypes();
      await showTypePages(items, 'type list');
    });

  addSharedOptions(type.command('search'))
    .description(
      // i18n: cli.command.type.search.description
      '搜索叶子类型',
    )
    .argument(
      '[keyword]',
      // i18n: cli.command.type.search.keyword
      '关键词',
    )
    .action(async function(this: Command, keyword: string | undefined) {
      requireTypeAuth(this);
      const items = await searchLeafTypes(keyword ?? '');
      await showTypePages(items, `type search ${keyword ?? ''}`.trim());
    });

  addSharedOptions(type.command('pick'))
    .description(
      // i18n: cli.command.type.pick.description
      '挑选叶子类型',
    )
    .option(
      '--type <code>',
      // i18n: cli.command.type.pick.type
      '类型编号',
    )
    .action(async function(this: Command, options: { type?: string }) {
      requireTypeAuth(this);
      if (!options.type) {
        const items = await listLeafTypes();
        await showTypePages(items, 'type pick');
        return;
      }
      const info = await getTypeInfo(options.type);
      console.log(formatTypeInfo(info, await getTypeHierarchy(info.code)));
    });

  addSharedOptions(type.command('info'))
    .description(
      // i18n: cli.command.type.info.description
      '查看类型详情',
    )
    .argument(
      '[type]',
      // i18n: cli.command.type.info.type
      '类型编号',
    )
    .action(async function(this: Command, code: string | undefined) {
      requireTypeAuth(this);
      if (!code) {
        // i18n: cli.type.code_required
        throw new CliError('请提供类型编号', 'TYPE_CODE_REQUIRED');
      }
      const info = await getTypeInfo(code);
      console.log(formatTypeInfo(info, await getTypeHierarchy(info.code)));
    });

  return type;
}
