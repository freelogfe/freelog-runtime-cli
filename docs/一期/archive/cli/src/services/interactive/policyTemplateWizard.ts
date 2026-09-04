import * as p from '@clack/prompts';
import { consola } from 'consola';
import { cliError } from '../../i18n/cliError.js';
import {
  formatPolicyTemplateOption,
  listPolicyTemplates,
  policyTemplateCommitPreview,
  policyTemplatePreview,
  printPolicyTemplateList,
  printPolicyTemplatePreview,
  type PolicyTemplateInput,
  type PolicyTemplateParam,
  type PolicyTemplateSummary,
} from '../policyTemplate/index.js';
import { ensureSynced } from '../sync/index.js';
import type { InteractiveContext } from './context.js';
import { confirmInteractiveWrite } from './interactiveWrite.js';

/**
 * TTY 策略模板向导：模板列表 → 参数编辑 → 译文/摘要预览 → 确认应用。
 *
 * project、session 和 studio 共享同一个 InteractiveContext，因此这层只组织交互，不拼平台 payload；
 * 真正的 Console Builder 规则由 services/policyTemplate/* 承担。
 */
export async function runSessionPolicyTemplateList(ctx: InteractiveContext): Promise<void> {
  printPolicyTemplateList(await loadSessionPolicyTemplates(ctx));
}

export async function runSessionPolicyTemplateApply(ctx: InteractiveContext): Promise<void> {
  const templates = await loadSessionPolicyTemplates(ctx);
  if (!templates.length) {
    printPolicyTemplateList(templates);
    return;
  }

  const templateId = await p.select({
    message: '选择策略模板',
    options: templates.map((template) => ({
      value: template.id,
      label: formatPolicyTemplateOption(template),
    })),
  });
  if (p.isCancel(templateId)) return;
  const template = templates.find((item) => item.id === templateId);
  if (!template) return;

  const policyName = await promptPolicyTemplateName(template.title);
  if (!policyName) return;

  const params = await promptPolicyTemplateParams(template.inputs);
  if (!params) return;

  const preview = await policyTemplatePreview({
    store: ctx.store,
    templateId: template.id,
    policyName,
    params,
  });
  printPolicyTemplatePreview(preview);
  if (!(await confirmInteractiveWrite('确认从模板应用策略？'))) return;

  const applied = await policyTemplateCommitPreview({
    store: ctx.store,
    preview,
  });
  consola.success(`已从模板应用策略：${applied.policyName}`);
}

async function loadSessionPolicyTemplates(
  ctx: InteractiveContext,
): Promise<PolicyTemplateSummary[]> {
  const synced = await ensureSynced({ store: ctx.store });
  const resourceTypeCode = synced.info.resourceTypeCode || synced.resource.resourceTypeCode;
  if (!resourceTypeCode) {
    throw cliError('当前资源缺少 resourceTypeCode，无法加载策略模板', {
      code: 4,
      hint: '先选择/发布一个带资源类型的资源，或用 policy template list --resource-type <code> 查看',
    });
  }
  return listPolicyTemplates({ resourceTypeCodes: [resourceTypeCode] });
}

export async function promptPolicyTemplateName(defaultValue: string): Promise<string | null> {
  const policyName = await p.text({
    message: '策略名称',
    defaultValue,
    validate: (value) => validatePolicyNameText(value),
  });
  return p.isCancel(policyName) ? null : String(policyName).trim();
}

function validatePolicyNameText(value: unknown): string | undefined {
  const name = String(value ?? '').trim();
  if (!name) return '请输入策略名称';
  if (name.length < 2) return '策略名称不少于 2 个字符';
  if (name.length > 20) return '策略名称不超过 20 个字符';
  return undefined;
}

export async function promptPolicyTemplateParams(
  inputs: PolicyTemplateInput[],
): Promise<PolicyTemplateParam[] | null> {
  const params: PolicyTemplateParam[] = [];
  for (const input of inputs) {
    const value = await promptPolicyTemplateParam(input);
    if (value === null) return null;
    params.push({ name: input.name, value });
  }
  return params;
}

async function promptPolicyTemplateParam(
  input: PolicyTemplateInput,
): Promise<string | number | null> {
  if (input.type === 'select' && input.options.length) {
    const picked = await p.select({
      message: input.name,
      options: input.options.map((option) => ({
        value: option.value,
        label: option.label || option.value,
      })),
    });
    return p.isCancel(picked) ? null : String(picked);
  }

  const answer = await p.text({
    message: input.name,
    defaultValue: input.defaultValue == null ? '' : String(input.defaultValue),
    validate: (value) => validatePolicyTemplateParam(input, value),
  });
  if (p.isCancel(answer)) return null;
  const trimmed = String(answer).trim();
  return input.type === 'number' ? Number(trimmed) : trimmed;
}

function validatePolicyTemplateParam(
  input: PolicyTemplateInput,
  value: unknown,
): string | undefined {
  const text = String(value ?? '').trim();
  if (!text) return '必填';
  if (input.type !== 'number') return undefined;

  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return '请输入数字';
  if (input.min != null && numeric < input.min) return `不能小于 ${input.min}`;
  if (input.precision === 0 && !Number.isInteger(numeric)) return '请输入整数';
  if (input.precision != null && input.precision > 0) {
    const decimal = text.includes('.') ? text.split('.')[1] || '' : '';
    if (decimal.length > input.precision) return `最多 ${input.precision} 位小数`;
  }
  return undefined;
}
