/** `version attr add/set/rm/list` 命令：属性编辑入口。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { attrAdd, attrList, attrReview, attrReviewDiscard, attrRm, attrSet } from '../../domain/version/form/attr';

/** version attr add/set/rm/list 命令装配。 */
export function createVersionAttrCommand(): Command {
  const attr = addSharedOptions(new Command('attr'));
  attr.description('改稿上的属性');

  addSharedOptions(attr.command('add'))
    .description('加自定义属性')
    .argument('[line]', '一行式')
    .action(async function (this: Command, line: string | undefined) {
      const shared = readSharedOptions(this);
      console.log(await attrAdd(resolveCwd(shared.cwd), { line, file: shared.file, yes: shared.yes }));
    });

  addSharedOptions(attr.command('set'))
    .description('改属性')
    .argument('[line]', '一行式')
    .action(async function (this: Command, line: string | undefined) {
      const shared = readSharedOptions(this);
      console.log(await attrSet(resolveCwd(shared.cwd), { line, file: shared.file, yes: shared.yes }));
    });

  addSharedOptions(attr.command('rm'))
    .description('删自定义属性')
    .argument('<key>', '键')
    .action(function (this: Command, key: string) {
      const shared = readSharedOptions(this);
      console.log(attrRm(resolveCwd(shared.cwd), key, shared.file));
    });

  addSharedOptions(attr.command('list'))
    .description('列稿上的属性')
    .action(function (this: Command) {
      const shared = readSharedOptions(this);
      console.log(attrList(resolveCwd(shared.cwd), shared.file));
    });

  const review = addSharedOptions(attr.command('review'))
    .description('查看或处理文件分析变化后的附加属性');
  review.action(function(this: Command) {
    const shared = readSharedOptions(this);
    console.log(attrReview(resolveCwd(shared.cwd), shared.file));
  });
  addSharedOptions(review.command('discard'))
    .description('确认丢弃一项待复核附加属性')
    .argument('<key>', '附加属性键')
    .action(async function(this: Command, key: string) {
      const shared = readSharedOptions(this);
      console.log(await attrReviewDiscard(resolveCwd(shared.cwd), {
        key,
        file: shared.file,
        yes: shared.yes,
      }));
    });

  return attr;
}
