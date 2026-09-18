/** 合集 listing 命令。 */

import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { updateCollectionListing } from '../../domain/collection/listing';
import { addCollectionOptions } from './options';

/** 装配合集 listing 更新命令。 */
export function createCollectionUpdateCommand(): Command {
  return addCollectionOptions(new Command('update'))
    .description('修改合集标题、封面、简介、标签；不发布、不上架')
    .option('--title <text>', '合集标题')
    .option('--intro <text>', '合集简介')
    .option('--cover <path>', '本地封面图片')
    .option('--tag <text>', '添加或设置一个标签，可重复；不传时保持原标签', (value: string, previous: string[] = []) => [...previous, value], [])
    .option('--clear-tags', '清空全部标签；不能与 --tag 同用')
    .action(async function(this: Command, options: { title?: string; intro?: string; cover?: string; tag?: string[]; clearTags?: boolean }) {
      const shared = readSharedOptions(this);
      await updateCollectionListing({
        cwd: resolveCwd(shared.cwd), selector: shared.file, title: options.title, intro: options.intro, cover: options.cover,
        ...(options.tag?.length ? { tags: options.tag } : {}), clearTags: options.clearTags, yes: shared.yes,
      });
    });
}
