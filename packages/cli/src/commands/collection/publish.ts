/** 合集发布命令。 */
import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { inspectCollectionPublishIntent, publishCollection } from '../../domain/collection/publish';
import { addCollectionOptions } from './options';

/** 装配合集发布与未知结果核验命令。 */
export function createCollectionPublishCommand(): Command {
  const publish = addCollectionOptions(new Command('publish'))
    .description('发布本地合集表单，并按需原子合并服务端目录草稿；不会上架')
    .option('--include-items <mode>', 'auto、yes 或 no', 'auto')
    .action(async function(this: Command, options: { includeItems: string }) {
      if (options.includeItems !== 'auto' && options.includeItems !== 'yes' && options.includeItems !== 'no') throw new CliError('--include-items 仅支持 auto、yes 或 no', 'COLLECTION_MERGE_MODE_INVALID');
      const shared = readSharedOptions(this);
      await publishCollection({ cwd: resolveCwd(shared.cwd), selector: shared.file, includeItems: options.includeItems, yes: shared.yes });
      console.log('合集变更已发布；未执行上架。');
    });
  addCollectionOptions(publish.command('resume'))
    .description('只读核验未知发布 intent；绝不自动重发')
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      console.log(JSON.stringify(await inspectCollectionPublishIntent({ cwd: resolveCwd(shared.cwd), selector: shared.file }), null, 2));
    });
  return publish;
}
