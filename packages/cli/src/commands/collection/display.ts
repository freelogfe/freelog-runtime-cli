/** 合集目录展示设置便捷入口；底层仍是本地表单操作稿。 */
import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { setCollectionDisplay } from '../../domain/collection/form';
import { addCollectionOptions } from './options';

function bool(value: string | undefined, flag: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new CliError(`${flag} 仅支持 true 或 false`, 'COLLECTION_DISPLAY_BOOLEAN_INVALID');
}

/** 装配合集目录展示设置命令。 */
export function createCollectionDisplayCommand(): Command {
  const display = addCollectionOptions(new Command('display')).description('修改本地表单中的目录展示设置，不发布');
  addCollectionOptions(display.command('set'))
    .option('--sort <mode>', 'ascending 或 descending').option('--title <mode>', 'resource-title、serial-number、custom 或 hidden')
    .option('--number <true|false>', '是否展示序号').option('--image <true|false>', '是否展示图片').option('--description <true|false>', '是否展示描述').option('--view <mode>', 'list 或 card')
    .action(async function(this: Command, options: { sort?: string; title?: string; number?: string; image?: string; description?: string; view?: string }) {
      if (options.sort !== undefined && options.sort !== 'ascending' && options.sort !== 'descending') throw new CliError('--sort 仅支持 ascending 或 descending', 'COLLECTION_DISPLAY_SORT_INVALID');
      if (options.title !== undefined && !['resource-title', 'serial-number', 'custom', 'hidden'].includes(options.title)) throw new CliError('--title 值无效', 'COLLECTION_DISPLAY_TITLE_INVALID');
      if (options.view !== undefined && options.view !== 'list' && options.view !== 'card') throw new CliError('--view 仅支持 list 或 card', 'COLLECTION_DISPLAY_VIEW_INVALID');
      const shared = readSharedOptions(this);
      const result = await setCollectionDisplay({ cwd: resolveCwd(shared.cwd), selector: shared.file, sort: options.sort as 'ascending' | 'descending' | undefined,
        title: options.title as 'resource-title' | 'serial-number' | 'custom' | 'hidden' | undefined, number: bool(options.number, '--number'), image: bool(options.image, '--image'), description: bool(options.description, '--description'), view: options.view as 'list' | 'card' | undefined });
      console.log(JSON.stringify(result.display, null, 2));
    });
  return display;
}
