/** `policy template list/apply`：列当前取得的全量模板并应用其 defaultValue。 */

import { confirm, select } from '@inquirer/prompts';
import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { applyPolicyTemplate, getPolicyTemplates, listPolicyTemplates, type PolicyTemplate } from '../../domain/policy/list';

async function chooseTemplate(templates: PolicyTemplate[]): Promise<PolicyTemplate | undefined> {
  let page = 0;
  const pageSize = 20;
  while (true) {
    const slice = templates.slice(page * pageSize, (page + 1) * pageSize);
    const value = await select({
      message: `请选择授权策略模板（第 ${page + 1}/${Math.ceil(templates.length / pageSize)} 页）`,
      choices: [
        ...slice.map((item) => ({ name: `${item.name} (${item.id})${item.summary ? ` — ${item.summary}` : ''}`, value: item.id })),
        ...(page > 0 ? [{ name: '上一页', value: '__previous__' }] : []),
        ...(page < Math.ceil(templates.length / pageSize) - 1 ? [{ name: '下一页', value: '__next__' }] : []),
        { name: '取消', value: '__cancel__' },
      ],
    });
    if (value === '__previous__') { page -= 1; continue; }
    if (value === '__next__') { page += 1; continue; }
    if (value === '__cancel__') return undefined;
    return templates.find((item) => item.id === value);
  }
}

/** 装配按类型分页列模板和选择模板追加的命令。 */
export function createPolicyTemplateCommand(): Command {
  const template = addSharedOptions(new Command('template')).description('授权策略模板');
  addSharedOptions(template.command('list'))
    .description('列当前模板列表')
    .option('--page <n>', '页码，从 1 开始', Number)
    .option('--page-size <n>', '每页 1–100 条，默认 20', Number)
    .action(async function (this: Command, options: { page?: number; pageSize?: number }) {
      const shared = readSharedOptions(this);
      console.log(await listPolicyTemplates({ cwd: resolveCwd(shared.cwd), file: shared.file, page: options.page, pageSize: options.pageSize }));
    });
  addSharedOptions(template.command('apply'))
    .description('应用当前类型的一条模板并启用')
    .argument('[templateId]', '模板编号')
    .option('--name <name>', '策略名')
    .action(async function (this: Command, templateId: string | undefined, options: { name?: string }) {
      const shared = readSharedOptions(this);
      const cwd = resolveCwd(shared.cwd);
      const yes = shared.yes === true;
      const templates = await getPolicyTemplates({ cwd, file: shared.file });
      let item = templateId ? templates.find((candidate) => candidate.id === templateId) : undefined;
      if (!item && templateId) throw new CliError('指定模板不在当前模板列表中', 'POLICY_TEMPLATE_INVALID');
      if (!item) {
        if (yes || !process.stdin.isTTY) throw new CliError('--yes 或非交互模式必须提供 templateId', 'POLICY_TEMPLATE_ID');
        item = await chooseTemplate(templates);
        if (!item) return;
      }
      const policyName = options.name ?? item.name;
      if (!yes && !await confirm({ message: `添加并启用策略「${policyName}」？`, default: true })) return;
      await applyPolicyTemplate({ cwd, file: shared.file, templateId: item.id, policyName });
      console.log('已添加并启用授权策略');
    });
  return template;
}
