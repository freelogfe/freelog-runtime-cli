import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { applyPolicy, listPolicyTemplates } from '../../domain/policy/list';

export function createPolicyTemplateCommand(): Command {
  const template = addSharedOptions(new Command('template'));
  template.description(
    // i18n: cli.command.policy.template.description
    '免费策略模板',
  );

  addSharedOptions(template.command('list'))
    .description(
      // i18n: cli.command.policy.template.list.description
      '列推荐免费模板',
    )
    .action(async (options: { cwd?: string }) => {
      console.log(await listPolicyTemplates({ cwd: resolveCwd(options.cwd) }));
    });

  addSharedOptions(template.command('apply'))
    .description(
      // i18n: cli.command.policy.template.apply.description
      '追加一条免费策略',
    )
    .argument('<templateId>', '模板编号')
    .option('--name <name>', '策略名')
    .action(async (templateId: string, options: {
      name?: string;
      file?: string;
      cwd?: string;
      yes?: boolean;
    }) => {
      if (options.yes && !templateId) {
        // i18n: cli.policy.template_id_required
        throw new CliError('--yes 无模板 id', 'POLICY_TEMPLATE_ID');
      }
      await applyPolicy({
        cwd: resolveCwd(options.cwd),
        file: options.file,
        policyName: options.name ?? templateId,
        policyText: `for_free_template ${templateId}`,
      });
    });

  return template;
}
