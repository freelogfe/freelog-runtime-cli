/** `policy template list/apply`：列当前取得的全量模板并应用其 defaultValue。 */

import { confirm } from '@inquirer/prompts';
import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { isInteractive, selectQuestion } from '../../core/tty';
import {
  applyPolicyTemplate,
  formatPolicyTemplatePage,
  getPolicyTemplates,
  policyTemplatePage,
  POLICY_TEMPLATE_PAGE_SIZE,
  type PolicyTemplate,
} from '../../domain/policy/list';

/** 平台模板很多：固定 20 条分页；当前快照内切页，不重复请求平台。 */
async function showTemplatePages(templates: readonly PolicyTemplate[]): Promise<void> {
  let page = 1;
  while (true) {
    const current = policyTemplatePage(templates, page);
    console.log(formatPolicyTemplatePage(current));
    if (!current.hasPrevious && !current.hasNext) return;
    if (!isInteractive()) {
      if (current.hasNext) {
        console.log(`还有 ${current.total - current.page * POLICY_TEMPLATE_PAGE_SIZE} 个授权策略模板；请在交互终端运行 policy template list 查看后续页`);
      }
      return;
    }
    const action = await selectQuestion('授权策略模板列表', [
      ...(current.hasPrevious ? [{ name: '上一页', value: '__previous__' }] : []),
      ...(current.hasNext ? [{ name: '下一页', value: '__next__' }] : []),
      { name: '退出', value: '__exit__' },
    ]);
    if (action === '__exit__') return;
    page += action === '__next__' ? 1 : -1;
  }
}

async function chooseTemplate(templates: PolicyTemplate[]): Promise<PolicyTemplate | undefined> {
  let page = 1;
  while (true) {
    const current = policyTemplatePage(templates, page);
    const value = await selectQuestion(`请选择授权策略模板（第 ${current.page}/${current.pageCount} 页）`, [
      ...current.items.map((item) => ({ name: `${item.name} (${item.id})${item.summary ? ` — ${item.summary}` : ''}`, value: item.id })),
      ...(current.hasPrevious ? [{ name: '上一页', value: '__previous__' }] : []),
      ...(current.hasNext ? [{ name: '下一页', value: '__next__' }] : []),
      { name: '取消', value: '__cancel__' },
    ]);
    if (value === '__previous__') { page -= 1; continue; }
    if (value === '__next__') { page += 1; continue; }
    if (value === '__cancel__') return undefined;
    return templates.find((item) => item.id === value);
  }
}

/** 装配全量模板的固定分页浏览与选择模板追加命令。 */
export function createPolicyTemplateCommand(): Command {
  const template = addSharedOptions(new Command('template')).description('授权策略模板');
  addSharedOptions(template.command('list'))
    .description('列当前模板列表（每页 20 条）')
    .action(async function (this: Command) {
      const shared = readSharedOptions(this);
      await showTemplatePages(await getPolicyTemplates({ cwd: resolveCwd(shared.cwd), file: shared.file }));
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
