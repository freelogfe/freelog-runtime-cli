import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import {
  formatTypeList,
  getTypeInfo,
  listLeafTypes,
  searchLeafTypes,
} from '../../domain/create/typePick';

export function createTypeCommand(): Command {
  const type = addSharedOptions(new Command('type'));
  type.description(
    // i18n: cli.command.type.description
    '查询叶子类型',
  );

  addSharedOptions(type.command('list'))
    .description(
      // i18n: cli.command.type.list.description
      '列出叶子类型',
    )
    .action(async () => {
      const items = await listLeafTypes();
      const text = formatTypeList(items);
      if (text) {
        console.log(text);
      }
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
    .action(async (keyword: string | undefined) => {
      const items = await searchLeafTypes(keyword ?? '');
      const text = formatTypeList(items);
      if (text) {
        console.log(text);
      }
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
    .action(async (options: { type?: string; yes?: boolean }) => {
      if (!options.type) {
        const items = await listLeafTypes();
        const text = formatTypeList(items);
        if (text) {
          console.log(text);
        }
        return;
      }
      const info = await getTypeInfo(options.type);
      console.log(`${info.code}\t${info.nameChain ?? info.name}`);
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
    .action(async (code: string | undefined) => {
      if (!code) {
        // i18n: cli.type.code_required
        throw new CliError('请提供类型编号', 'TYPE_CODE_REQUIRED');
      }
      const info = await getTypeInfo(code);
      console.log(`${info.code}\t${info.nameChain ?? info.name}`);
    });

  return type;
}
