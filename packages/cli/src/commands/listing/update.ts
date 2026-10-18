/** `update` 命令：listing（标题/简介/封面/标签）编辑入口。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { updateListing, type ListingView } from '../../domain/listing/update';

function displayListing(listing: ListingView): void {
  console.log(`标识：${listing.resourceName}（一旦创建不能改）\n标题：${listing.title}\n封面：${listing.coverImages.length ? '已有封面' : '无封面'}\n简介：${listing.intro.length}字\n标签：${listing.tags.length ? listing.tags.join('、') : '无标签'}`);
}

/** update 命令装配（改 title/intro/cover/tags）。 */
export function createUpdateCommand(): Command {
  const command = addSharedOptions(new Command('update'));
  command
    .description(
      // i18n: cli.command.update.description
      '只改标题简介封面标签',
    )
    .option('--title <title>', '标题')
    .option('--intro <intro>', '简介')
    .option('--cover <path>', '封面')
    .option('--tags <tags>', '标签')
    .action(async function(this: Command, options: {
      title?: string;
      intro?: string;
      cover?: string;
      tags?: string;
      yes?: boolean;
      file?: string;
      cwd?: string;
    }) {
      const shared = readSharedOptions(this);
      const result = await updateListing({
        cwd: resolveCwd(shared.cwd),
        file: shared.file,
        title: options.title,
        intro: options.intro,
        cover: options.cover,
        tags: options.tags,
        yes: shared.yes,
        json: shared.json,
        onCurrent: shared.json ? undefined : (listing) => { console.log('当前资源信息'); displayListing(listing); },
      });
      if (shared.json) console.log(JSON.stringify(result));
      else {
        console.log(result.changed ? '资源信息已更新并核验；上架请使用 online' : '没有变更');
        if (result.changed) displayListing(result.listing);
      }
    });
  return command;
}
