import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { formatTemplateList, listTemplates } from '../../domain/init/templates';

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
    .action((options: { scaffold?: string }) => {
      const text = formatTemplateList(listTemplates(options.scaffold));
      if (text) {
        console.log(text);
      }
    });

  return template;
}
