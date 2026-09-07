/** `policy template list/apply` 命令：平台免费策略模板。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { applyPolicy, listPolicyTemplates } from '../../domain/policy/list';

/** policy template 命令装配（list/apply）。 */
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
    .action(async function(this: Command, options: { cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(await listPolicyTemplates({ cwd: resolveCwd(options.cwd) }));
    });

  addSharedOptions(template.command('apply'))
    .description(
      // i18n: cli.command.policy.template.apply.description
      '追加一条免费策略',
    )
    .argument('<templateId>', '模板编号')
    .option('--name <name>', '策略名')
    .action(async function(this: Command, templateId: string, options: {
      name?: string;
      file?: string;
      cwd?: string;
      yes?: boolean;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
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
