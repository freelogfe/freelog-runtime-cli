/** `resource sync` / `recover`：工程级资源状态维护。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { syncResourceTitles } from '../../domain/resource/sync';
import { recoverPendingOperation } from '../../domain/resource/recover';
import { diagnoseLocalState } from '../../local/diagnostics';

/** 创建资源状态维护命令组。 */
export function createResourceCommand(): Command {
  const resource = addSharedOptions(new Command('resource')).description('资源本地状态维护');
  resource.command('list').description('只读诊断本地资源状态（损坏时也可运行）').action(function(this: Command) {
    const shared = readSharedOptions(this);
    console.log(diagnoseLocalState(resolveCwd(shared.cwd)));
  });
  resource.command('sync').description('从平台同步本地资源标题').action(async function(this: Command) {
    const shared = readSharedOptions(this);
    console.log(await syncResourceTitles({ cwd: resolveCwd(shared.cwd), selector: shared.file }));
  });
  resource.command('recover').description('处理未决版本提交，绝不重发')
    .option('--apply', 'prepared 仅清 marker；sending 须远端版本和 SHA 已证明成功才清理稿')
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      const options = this.opts<{ apply?: boolean }>();
      console.log(await recoverPendingOperation({
        cwd: resolveCwd(shared.cwd),
        apply: options.apply === true,
        yes: shared.yes,
      }));
    });
  return resource;
}
