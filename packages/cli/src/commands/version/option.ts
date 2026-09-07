import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { optionAdd, optionList, optionRm, optionSet } from '../../domain/version/form/option';

export function createVersionOptionCommand(): Command {
  const option = addSharedOptions(new Command('option'));
  option.description(
    // i18n: cli.command.version.option.description
    '改稿上的可选配置',
  );

  addSharedOptions(option.command('add'))
    .description(
      // i18n: cli.command.version.option.add.description
      '加可选配置',
    )
    .argument('[line]', '一行式')
    .action(async (line: string | undefined, options: { file?: string; cwd?: string; yes?: boolean }) => {
      console.log(await optionAdd(resolveCwd(options.cwd), {
        line,
        file: options.file,
        yes: options.yes,
      }));
    });

  addSharedOptions(option.command('set'))
    .description(
      // i18n: cli.command.version.option.set.description
      '改可选配置',
    )
    .argument('[line]', '一行式')
    .action(async (line: string | undefined, options: { file?: string; cwd?: string; yes?: boolean }) => {
      console.log(await optionSet(resolveCwd(options.cwd), {
        line,
        file: options.file,
        yes: options.yes,
      }));
    });

  addSharedOptions(option.command('rm'))
    .description(
      // i18n: cli.command.version.option.rm.description
      '删可选配置',
    )
    .argument('<key>', '键')
    .action((key: string, options: { file?: string; cwd?: string }) => {
      console.log(optionRm(resolveCwd(options.cwd), key, options.file));
    });

  addSharedOptions(option.command('list'))
    .description(
      // i18n: cli.command.version.option.list.description
      '列可选配置',
    )
    .action((options: { file?: string; cwd?: string }) => {
      console.log(optionList(resolveCwd(options.cwd), options.file));
    });

  return option;
}
