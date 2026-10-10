import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { addCollectionDependency, listCollectionDependencies, removeCollectionDependency } from '../../domain/collection/dependencies';
import { addCollectionOptions } from './options';

/** 装配合集自身直接依赖命令。 */
export function createCollectionDependencyCommand(): Command {
  const dep = addCollectionOptions(new Command('dep')).description('维护合集自身的直接依赖；只写本地表单，不发布目录');
  addCollectionOptions(dep.command('list')).action(async function(this: Command) { const shared = readSharedOptions(this); console.log(JSON.stringify(await listCollectionDependencies({ cwd: resolveCwd(shared.cwd), selector: shared.file }), null, 2)); });
  addCollectionOptions(dep.command('add')).argument('<source>', '线上单资源 id: 或 name:').option('--range <range>', 'semver 范围').option('--policy <id>', '未授权时显式选择策略').action(async function(this: Command, source: string, options: { range?: string; policy?: string }) { const shared = readSharedOptions(this); console.log(JSON.stringify(await addCollectionDependency({ cwd: resolveCwd(shared.cwd), selector: shared.file, source, range: options.range, policyId: options.policy, yes: shared.yes }), null, 2)); });
  addCollectionOptions(dep.command('rm')).argument('<resource-id>', '依赖资源 ID').action(async function(this: Command, resourceId: string) { const shared = readSharedOptions(this); await removeCollectionDependency({ cwd: resolveCwd(shared.cwd), selector: shared.file, resourceId }); });
  addCollectionOptions(dep.command('range')).argument('<source>', '线上单资源 id: 或 name:').requiredOption('--range <range>', 'semver 范围').option('--policy <id>', '未授权时显式选择策略').action(async function(this: Command, source: string, options: { range: string; policy?: string }) { const shared = readSharedOptions(this); console.log(JSON.stringify(await addCollectionDependency({ cwd: resolveCwd(shared.cwd), selector: shared.file, source, range: options.range, policyId: options.policy, yes: shared.yes }), null, 2)); });
  return dep;
}
