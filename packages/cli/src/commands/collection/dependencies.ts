import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { addCollectionDependency, listCollectionDependencies, removeCollectionDependency } from '../../domain/collection/dependencies';
import { addCollectionOptions } from './options';

/** 装配合集自身直接依赖命令。 */
export function createCollectionDependencyCommand(): Command {
  const dep = addCollectionOptions(new Command('dep')).description('声明合集直接依赖；不签约或支付，授权到网页处理');
  addCollectionOptions(dep.command('list')).action(async function(this: Command) { const shared = readSharedOptions(this); console.log(JSON.stringify(await listCollectionDependencies({ cwd: resolveCwd(shared.cwd), selector: shared.file }), null, 2)); });
  addCollectionOptions(dep.command('add')).argument('<source>', '线上单资源 id: 或 name:').option('--range <range>', 'semver 范围').action(async function(this: Command, source: string, options: { range?: string }) {
    const shared = readSharedOptions(this);
    console.log(JSON.stringify(await addCollectionDependency({ cwd: resolveCwd(shared.cwd), selector: shared.file, source, range: options.range }), null, 2));
    console.error('仅声明依赖，CLI 未签约或支付；需要授权请到网页以当前合集身份处理，不是用户个人。');
  });
  addCollectionOptions(dep.command('rm')).argument('<resource-id>', '依赖资源 ID').action(async function(this: Command, resourceId: string) { const shared = readSharedOptions(this); await removeCollectionDependency({ cwd: resolveCwd(shared.cwd), selector: shared.file, resourceId }); });
  addCollectionOptions(dep.command('range')).argument('<source>', '线上单资源 id: 或 name:').requiredOption('--range <range>', 'semver 范围').action(async function(this: Command, source: string, options: { range: string }) {
    const shared = readSharedOptions(this);
    console.log(JSON.stringify(await addCollectionDependency({ cwd: resolveCwd(shared.cwd), selector: shared.file, source, range: options.range }), null, 2));
    console.error('仅修改依赖声明，CLI 未签约或支付；需要授权请到网页以当前合集身份处理，不是用户个人。');
  });
  return dep;
}
