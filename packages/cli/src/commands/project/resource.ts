/** `resource sync`：批量刷新当前工程的本地资源标题。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { syncResourceTitles } from '../../domain/resource/sync';

/** 创建资源状态维护命令组。 */
export function createResourceCommand(): Command {
  const resource = addSharedOptions(new Command('resource')).description('资源本地状态维护');
  resource.command('sync').description('从平台同步本地资源标题').action(async function(this: Command) {
    const shared = readSharedOptions(this);
    console.log(await syncResourceTitles({ cwd: resolveCwd(shared.cwd), selector: shared.file }));
  });
  return resource;
}
