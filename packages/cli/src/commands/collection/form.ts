/** 合集本地表单命令。 */
import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { editCollectionForm, pullCollectionForm, showCollectionForm, writeCollectionFormExport } from '../../domain/collection/form';
import { addCollectionOptions } from './options';

/** 装配合集本地表单操作稿命令。 */
export function createCollectionFormCommand(): Command {
  const form = addCollectionOptions(new Command('form')).description('维护合集本地表单操作稿；不读取浏览器草稿、不发布');
  addCollectionOptions(form.command('pull'))
    .requiredOption('--out <path>', '写出完整 collection form JSON')
    .action(async function(this: Command, options: { out: string }) {
      const shared = readSharedOptions(this); const cwd = resolveCwd(shared.cwd);
      const result = await pullCollectionForm({ cwd, selector: shared.file, yes: shared.yes }); writeCollectionFormExport(cwd, options.out, result);
      console.log(`已写出 ${options.out}，并刷新本地合集表单操作稿`);
    });
  addCollectionOptions(form.command('edit'))
    .requiredOption('--from <path>', '完整 collection form JSON')
    .action(async function(this: Command, options: { from: string }) {
      const shared = readSharedOptions(this); const result = await editCollectionForm({ cwd: resolveCwd(shared.cwd), selector: shared.file, from: options.from });
      console.log(JSON.stringify(result, null, 2));
    });
  addCollectionOptions(form.command('show'))
    .action(async function(this: Command) {
      const shared = readSharedOptions(this); console.log(JSON.stringify(await showCollectionForm({ cwd: resolveCwd(shared.cwd), selector: shared.file }), null, 2));
    });
  return form;
}
