/** `version dep add/rm/range/list` 命令：依赖编辑入口。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { depAdd, depList, depRange, depRm } from '../../domain/version/form/dep';

/** version dep add/rm/range/list 命令装配。 */
export function createVersionDepCommand(): Command {
  const dep = addSharedOptions(new Command('dep'));
  dep.description('声明工作稿依赖，不签约或支付；授权到网页处理');

  addSharedOptions(dep.command('add'))
    .description('加依赖')
    .argument('<resourceId>', '依赖资源 id 或完整 username/name')
    .option('--range <range>', '版本范围')
    .action(async function (this: Command, resourceId: string, options: { range?: string }) {
      const shared = readSharedOptions(this);
      console.log(await depAdd({
        cwd: resolveCwd(shared.cwd), resourceId, versionRange: options.range,
        file: shared.file,
      }));
      console.error('仅声明依赖，CLI 未签约或支付；需要授权请到网页以当前资源身份处理，不是用户个人。');
    });

  addSharedOptions(dep.command('list'))
    .description('列依赖')
    .action(function (this: Command) {
      const shared = readSharedOptions(this);
      console.log(depList(resolveCwd(shared.cwd), shared.file));
    });

  addSharedOptions(dep.command('rm'))
    .description('删依赖')
    .argument('<resourceId>', '依赖资源 id')
    .action(function (this: Command, resourceId: string) {
      const shared = readSharedOptions(this);
      console.log(depRm(resolveCwd(shared.cwd), resourceId, shared.file));
    });

  addSharedOptions(dep.command('range'))
    .description('改依赖版本范围')
    .argument('<resourceId>', '依赖资源 id')
    .option('--range <range>', '版本范围')
    .action(async function (this: Command, resourceId: string, options: { range?: string }) {
      if (!options.range) throw new CliError('请提供 --range', 'DEP_RANGE_REQUIRED');
      const shared = readSharedOptions(this);
      console.log(await depRange(resolveCwd(shared.cwd), resourceId, options.range, shared.file));
      console.error('仅修改依赖声明，CLI 未签约或支付；需要授权请到网页以当前资源身份处理，不是用户个人。');
    });

  return dep;
}
