import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { depAdd, depList, depRange, depRm } from '../../domain/version/form/dep';

export function createVersionDepCommand(): Command {
  const dep = addSharedOptions(new Command('dep'));
  dep.description(
    // i18n: cli.command.version.dep.description
    '改稿上的依赖',
  );

  addSharedOptions(dep.command('add'))
    .description(
      // i18n: cli.command.version.dep.add.description
      '加依赖',
    )
    .argument('<resourceId>', '依赖资源 id')
    .option('--range <range>', '版本范围')
    .action(async (resourceId: string, options: {
      range?: string;
      file?: string;
      cwd?: string;
    }) => {
      const id = await depAdd({
        cwd: resolveCwd(options.cwd),
        resourceId,
        versionRange: options.range,
        file: options.file,
      });
      console.log(id);
    });

  addSharedOptions(dep.command('list'))
    .description(
      // i18n: cli.command.version.dep.list.description
      '列依赖',
    )
    .action((options: { file?: string; cwd?: string }) => {
      console.log(depList(resolveCwd(options.cwd), options.file));
    });

  addSharedOptions(dep.command('rm'))
    .description(
      // i18n: cli.command.version.dep.rm.description
      '删依赖',
    )
    .argument('<resourceId>', '依赖资源 id')
    .action((resourceId: string, options: { file?: string; cwd?: string }) => {
      console.log(depRm(resolveCwd(options.cwd), resourceId, options.file));
    });

  addSharedOptions(dep.command('range'))
    .description(
      // i18n: cli.command.version.dep.range.description
      '改依赖版本范围',
    )
    .argument('<resourceId>', '依赖资源 id')
    .option('--range <range>', '版本范围')
    .action((resourceId: string, options: {
      range?: string;
      file?: string;
      cwd?: string;
    }) => {
      if (!options.range) {
        // i18n: cli.dep.range_required
        throw new CliError('请提供 --range', 'DEP_RANGE_REQUIRED');
      }
      console.log(depRange(resolveCwd(options.cwd), resourceId, options.range, options.file));
    });

  return dep;
}
