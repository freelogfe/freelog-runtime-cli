import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { attrAdd, attrList, attrRm, attrSet } from '../../domain/version/form/attr';

export function createVersionAttrCommand(): Command {
  const attr = addSharedOptions(new Command('attr'));
  attr.description(
    // i18n: cli.command.version.attr.description
    '改稿上的属性',
  );

  addSharedOptions(attr.command('add'))
    .description(
      // i18n: cli.command.version.attr.add.description
      '加自定义属性',
    )
    .argument('[line]', '一行式')
    .action(async (line: string | undefined, options: { file?: string; cwd?: string; yes?: boolean }) => {
      console.log(await attrAdd(resolveCwd(options.cwd), { line, file: options.file, yes: options.yes }));
    });

  addSharedOptions(attr.command('set'))
    .description(
      // i18n: cli.command.version.attr.set.description
      '改属性',
    )
    .argument('[line]', '一行式')
    .action(async (line: string | undefined, options: { file?: string; cwd?: string; yes?: boolean }) => {
      console.log(await attrSet(resolveCwd(options.cwd), { line, file: options.file, yes: options.yes }));
    });

  addSharedOptions(attr.command('rm'))
    .description(
      // i18n: cli.command.version.attr.rm.description
      '删自定义属性',
    )
    .argument('<key>', '键')
    .action((key: string, options: { file?: string; cwd?: string }) => {
      console.log(attrRm(resolveCwd(options.cwd), key, options.file));
    });

  addSharedOptions(attr.command('list'))
    .description(
      // i18n: cli.command.version.attr.list.description
      '列稿上的属性',
    )
    .action((options: { file?: string; cwd?: string }) => {
      console.log(attrList(resolveCwd(options.cwd), options.file));
    });

  return attr;
}
