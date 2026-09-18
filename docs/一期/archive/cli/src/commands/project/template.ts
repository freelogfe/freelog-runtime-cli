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
    .action(function() {
      const text = formatTemplateList(listTemplates());
      if (text) {
        console.log(text);
      }
    });

  return template;
}
