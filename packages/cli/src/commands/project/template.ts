/** `template list` 命令：runtime/package 脚手架模板列表。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { formatTemplateList, listTemplates } from '../../domain/init/templates';

/** template 命令装配。 */
export function createTemplateCommand(): Command {
  const template = addSharedOptions(new Command('template'));
  template.description(
    // i18n: cli.command.template.description
    '脚手架模板',
  );

  const list = addSharedOptions(template.command('list'));
  list
    .description(
      // i18n: cli.command.template.list.description
      '列出可用模板',
    )
    .option(
      '--scaffold <kind>',
      // i18n: cli.command.template.list.scaffold
      '模板种类：runtime / package',
    )
    .action(function(this: Command, options: { scaffold?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      const text = formatTemplateList(listTemplates(options.scaffold));
      if (text) {
        console.log(text);
      }
    });

  return template;
}
