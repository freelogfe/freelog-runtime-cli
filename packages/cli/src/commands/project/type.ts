/** `type list/search/info/pick` 命令：平台资源类型树，找叶子 typeCode。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import {
  formatTypeList,
  getTypeInfo,
  listLeafTypes,
  searchLeafTypes,
} from '../../domain/create/typePick';

/** type 命令装配（list/search/info/pick）。 */
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
    .action(async function(this: Command, keyword: string | undefined, options: Record<string, unknown>) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.env !== undefined && options.env === undefined) options.env = _s.env as any; if (_s.cwd !== undefined && options.cwd === undefined) options.cwd = _s.cwd as any; if (_s.json !== undefined && options.json === undefined) options.json = _s.json as any; void options; }
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
    .action(async function(this: Command, options: { type?: string; yes?: boolean }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
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
    .action(async function(this: Command, code: string | undefined, options: Record<string, unknown>) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.env !== undefined && options.env === undefined) options.env = _s.env as any; if (_s.cwd !== undefined && options.cwd === undefined) options.cwd = _s.cwd as any; if (_s.json !== undefined && options.json === undefined) options.json = _s.json as any; void options; }
      if (!code) {
        // i18n: cli.type.code_required
        throw new CliError('请提供类型编号', 'TYPE_CODE_REQUIRED');
      }
      const info = await getTypeInfo(code);
      console.log(`${info.code}\t${info.nameChain ?? info.name}`);
    });

  return type;
}
