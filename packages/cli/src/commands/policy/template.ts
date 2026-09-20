/** 参数化授权策略模板命令：TTY 由 list 选择并完成，精确 apply 供脚本/AI 直达。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { askInput, confirmQuestion, isInteractive, selectQuestion } from '../../core/tty';
import { resolveCwd } from '../../domain/account/login';
import {
  applyPolicy,
  formatPolicyTemplatePage,
  getPolicyTemplateCatalog,
  getPolicyTemplateInfo,
  policyTemplatePage,
  preparePolicyTemplate,
  POLICY_TEMPLATE_PAGE_SIZE,
  type PreparedPolicyTemplate,
  type PolicyTemplate,
} from '../../domain/policy/list';
import {
  defaultTemplateValues,
  parseTemplateParam,
  renderTemplateReport,
  templateJson,
  type TemplateParamInput,
  type TemplateValue,
} from '../../domain/policy/template';

export type PolicyTemplateSubject = { kind: 'resource' | 'collection'; resourceId: string; typeCode: string };
export type PolicyTemplateCatalog = { subject: PolicyTemplateSubject; templates: PolicyTemplate[] };
export type PolicyTemplateCommandBackend = {
  commandPrefix: string;
  getCatalog: (input: { cwd: string; file?: string }) => Promise<PolicyTemplateCatalog>;
  getInfo: (input: { cwd: string; file?: string; templateId: string }) => Promise<{ subject: PolicyTemplateSubject; template: PolicyTemplate }>;
  prepare: (input: { cwd: string; file?: string; templateId: string; expectedFingerprint: string; params: TemplateParamInput[]; requireEveryParam: boolean }) => Promise<PreparedPolicyTemplate>;
  apply: (input: { cwd: string; file?: string; policyName: string; policyText: string }) => Promise<void>;
};

function catalogJson(catalog: PolicyTemplateCatalog): string {
  return JSON.stringify({ schemaVersion: 1, subject: catalog.subject, templates: catalog.templates.map(templateJson) });
}

function infoJson(subject: PolicyTemplateSubject, template: PolicyTemplate): string {
  return JSON.stringify({ schemaVersion: 1, subject, templates: [templateJson(template)] });
}

function validPolicyName(name: string): boolean {
  const length = Array.from(name.trim()).length;
  return length >= 2 && length <= 20;
}

function requireValidPolicyName(name: string): string {
  const trimmed = name.trim();
  if (!validPolicyName(trimmed)) throw new CliError('策略名须为 2–20 个字符', 'POLICY_NAME_INVALID');
  return trimmed;
}

function detail(template: PolicyTemplate, values: ReadonlyMap<number, TemplateValue>, name: string): string {
  const fields = template.fields.map((field) => {
    const value = values.get(field.slot) ?? field.defaultValue;
    const options = field.type === 'select'
      ? `；选项：${field.options.map((option) => `${option.label}(${option.value})`).join('、')}`
      : '';
    return `[${field.slot}] ${field.type}；当前值：${value ?? '未填写'}${options}`;
  });
  return [`策略模板：${template.name} (${template.id})`, `策略名称：${name || '（尚未填写）'}`, renderTemplateReport(template, values), ...fields].join('\n');
}

function scriptSkeleton(template: PolicyTemplate, commandPrefix: string): string {
  const params = template.fields.map((field) => `--param "${field.slot}=${field.defaultValue ?? '<填写参数>'}"`).join(' ');
  return [
    '非交互命令骨架：',
    `${commandPrefix} apply ${template.id} --template-fingerprint ${template.fingerprint} --name "策略名称"${params ? ` ${params}` : ''} --yes`,
  ].join('\n');
}

function inputsFromValues(values: ReadonlyMap<number, TemplateValue>): TemplateParamInput[] {
  return [...values.entries()].map(([slot, value]) => ({ slot, value: String(value) }));
}

async function editField(template: PolicyTemplate, values: Map<number, TemplateValue>, slot: number): Promise<void> {
  const field = template.fields.find((item) => item.slot === slot);
  if (!field) throw new CliError('参数编号不属于当前模板', 'POLICY_TEMPLATE_PARAM_UNKNOWN');
  if (field.type === 'select') {
    const value = await selectQuestion(`参数 [${slot}]`, field.options.map((option) => ({ name: `${option.label} (${option.value})`, value: String(option.value) })));
    values.set(slot, field.options.find((option) => String(option.value) === value)!.value);
    return;
  }
  values.set(slot, await askInput(field.type === 'datetime' ? `参数 [${slot}]（YYYY-MM-DD HH:mm）` : `参数 [${slot}]（数字）`));
}

/** TTY 的完整编辑/预览/写入闭环。取消或验证失败不会写入。 */
async function runInteractiveApply(input: { cwd: string; file?: string; template: PolicyTemplate; yes: boolean; backend: PolicyTemplateCommandBackend }): Promise<boolean> {
  const values = defaultTemplateValues(input.template);
  let name = validPolicyName(input.template.name) ? input.template.name : '';
  while (true) {
    console.log(detail(input.template, values, name));
    const action = await selectQuestion('编辑授权策略模板', [
      { name: '修改策略名称', value: '__name__' },
      ...input.template.fields.map((field) => ({ name: `修改参数 [${field.slot}]`, value: String(field.slot) })),
      ...input.template.fields.map((field) => ({ name: `恢复参数 [${field.slot}] 默认值`, value: `reset:${field.slot}` })),
      { name: '预览并创建', value: '__preview__' },
      { name: '取消', value: '__cancel__' },
    ]);
    if (action === '__cancel__') return false;
    if (action === '__name__') { name = await askInput('策略名称（2–20 字）'); continue; }
    if (action.startsWith('reset:')) {
      const field = input.template.fields.find((item) => item.slot === Number(action.slice('reset:'.length)));
      if (field) {
        if (field.defaultValue === undefined) values.delete(field.slot);
        else values.set(field.slot, field.defaultValue);
      }
      continue;
    }
    if (action !== '__preview__') { await editField(input.template, values, Number(action)); continue; }
    let prepared;
    try {
      prepared = await input.backend.prepare({
        cwd: input.cwd, file: input.file, templateId: input.template.id, expectedFingerprint: input.template.fingerprint,
        params: inputsFromValues(values), requireEveryParam: false,
      });
      name = requireValidPolicyName(name);
    } catch (error) {
      if (error instanceof CliError) { console.error(error.message); continue; }
      throw error;
    }
    const preview = `最终策略译文：\n${prepared.translation}\n\n策略名称：${name}\n确认创建并启用？`;
    if (!input.yes && !await confirmQuestion(preview, true)) continue;
    try {
      await input.backend.apply({ cwd: input.cwd, file: input.file, policyName: name, policyText: prepared.policyText });
      console.log('已添加并启用授权策略');
      return true;
    } catch (error) {
      if (error instanceof CliError) { console.error(error.message); continue; }
      throw error;
    }
  }
}

/** list 的 TTY 分页同时是人工选择入口；一个快照内不重复拉模板。 */
async function chooseAndApply(cwd: string, file: string | undefined, templates: readonly PolicyTemplate[], yes: boolean, backend: PolicyTemplateCommandBackend): Promise<void> {
  let page = 1;
  while (true) {
    const current = policyTemplatePage(templates, page);
    const action = await selectQuestion(`授权策略模板（第 ${current.page}/${current.pageCount} 页）`, [
      ...current.items.map((item) => ({ name: `${item.name} (${item.id})${item.summary ? ` — ${item.summary}` : ''}`, value: item.id })),
      ...(current.hasPrevious ? [{ name: '上一页', value: '__previous__' }] : []),
      ...(current.hasNext ? [{ name: '下一页', value: '__next__' }] : []),
      { name: '退出', value: '__exit__' },
    ]);
    if (action === '__exit__') return;
    if (action === '__previous__') { page -= 1; continue; }
    if (action === '__next__') { page += 1; continue; }
    const chosen = templates.find((item) => item.id === action);
    if (!chosen) throw new CliError('选择的模板不在当前快照中', 'POLICY_TEMPLATE_INVALID');
    await runInteractiveApply({ cwd, file, template: chosen, yes, backend });
    return;
  }
}

function directMode(options: { templateFingerprint?: string; params: string[] }): boolean {
  return options.templateFingerprint !== undefined || options.params.length > 0 || !isInteractive();
}

/** 装配模板目录、详情和精确 ID 提交命令。 */
export function createPolicyTemplateCommandWithBackend(input: { addOptions: (command: Command) => Command; backend: PolicyTemplateCommandBackend }): Command {
  const template = input.addOptions(new Command('template')).description('授权策略模板');
  input.addOptions(template.command('list'))
    .description('浏览并选择授权策略模板（TTY 每页 20 条）')
    .action(async function (this: Command) {
      const shared = readSharedOptions(this);
      const cwd = resolveCwd(shared.cwd);
      const catalog = await input.backend.getCatalog({ cwd, file: shared.file });
      if (shared.json) { console.log(catalogJson(catalog)); return; }
      const first = policyTemplatePage(catalog.templates, 1);
      if (!isInteractive()) {
        console.log(formatPolicyTemplatePage(first));
        if (first.hasNext) console.log(`还有 ${first.total - first.page * POLICY_TEMPLATE_PAGE_SIZE} 个授权策略模板；请在交互终端运行 policy template list 查看后续页`);
        return;
      }
      await chooseAndApply(cwd, shared.file, catalog.templates, shared.yes === true, input.backend);
    });
  input.addOptions(template.command('info'))
    .description('查看一个授权策略模板的完整参数说明')
    .argument('<templateId>', '模板编号')
    .action(async function (this: Command, templateId: string) {
      const shared = readSharedOptions(this);
      const info = await input.backend.getInfo({ cwd: resolveCwd(shared.cwd), file: shared.file, templateId });
      if (shared.json) console.log(infoJson(info.subject, info.template));
      else console.log(`${detail(info.template, defaultTemplateValues(info.template), info.template.name)}\n\n${scriptSkeleton(info.template, input.backend.commandPrefix)}`);
    });
  input.addOptions(template.command('apply'))
    .description('按精确模板 ID 添加授权策略；脚本/AI 请显式传入全部参数')
    .argument('<templateId>', '模板编号')
    .option('--name <name>', '策略名')
    .option('--template-fingerprint <fingerprint>', 'template list --json 返回的模板指纹')
    .option('--param <slot=value>', '参数编号和值；可重复', (value: string, previous: string[]) => [...previous, value], [])
    .action(async function (this: Command, templateId: string, options: { name?: string; templateFingerprint?: string; param: string[] }) {
      const shared = readSharedOptions(this);
      const cwd = resolveCwd(shared.cwd);
      const params = options.param ?? [];
      if (directMode({ templateFingerprint: options.templateFingerprint, params })) {
        if (!shared.yes || !options.templateFingerprint || !options.name) {
          throw new CliError('脚本模式必须提供 --template-fingerprint、--name、全部 --param 和 --yes', 'POLICY_TEMPLATE_SCRIPT_REQUIRED');
        }
        const prepared = await input.backend.prepare({
          cwd, file: shared.file, templateId, expectedFingerprint: options.templateFingerprint,
          params: params.map(parseTemplateParam), requireEveryParam: true,
        });
        console.log(`最终策略译文：\n${prepared.translation}\n\n策略名称：${options.name}`);
        await input.backend.apply({ cwd, file: shared.file, policyName: requireValidPolicyName(options.name), policyText: prepared.policyText });
        console.log('已添加并启用授权策略');
        return;
      }
      const info = await input.backend.getInfo({ cwd, file: shared.file, templateId });
      await runInteractiveApply({ cwd, file: shared.file, template: info.template, yes: shared.yes === true, backend: input.backend });
    });
  return template;
}

/** 单资源适配器只解决目标解析；参数化策略流程完全由上面的公共命令实现。 */
export function createPolicyTemplateCommand(): Command {
  return createPolicyTemplateCommandWithBackend({
    addOptions: addSharedOptions,
    backend: {
      commandPrefix: 'freelog-cli policy template',
      getCatalog: (input) => getPolicyTemplateCatalog(input),
      getInfo: (input) => getPolicyTemplateInfo(input),
      prepare: (input) => preparePolicyTemplate(input),
      apply: (input) => applyPolicy(input),
    },
  });
}
