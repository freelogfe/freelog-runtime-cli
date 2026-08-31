import { assertExplicitEnvForWriteOperation } from '../core/command.js';
import { getConsoleBaseURL } from '../core/env.js';
import { cliError } from '../i18n/cliError.js';
import { FServiceAPI } from '../platform/index.js';
import { fetchResourceInfo, ensureSynced } from './sync/index.js';
import type { PlatformResourceInfo } from './sync/index.js';
import type { ProjectStore } from './store/types.js';
import {
  assertNewPoliciesUnique,
  buildPolicyUpdatePayload,
  type PolicyFileItem,
} from './policyService.js';

type PolicyTemplateInputType = 'number' | 'select' | 'datetime';

interface PolicyTemplateApiInput {
  id: string;
  uiSectionType?: 'number' | 'select';
  uiSectionDefaultValue?: string | number;
  selectOptions?: Array<{ label: string; value: string }>;
}

interface PolicyTemplateApiItem {
  _id: string;
  title: string;
  template: string;
  reportTranslate: string;
  report: string;
  reportUiTemplate?: PolicyTemplateApiInput[];
}

export interface PolicyTemplateInput {
  name: string;
  type: PolicyTemplateInputType;
  defaultValue?: string | number;
  min?: number;
  precision?: number;
  options: Array<{ label: string; value: string }>;
}

export interface PolicyTemplateSummary {
  id: string;
  title: string;
  code: string;
  translation: string;
  inputs: PolicyTemplateInput[];
}

export interface PolicyTemplateParam {
  name: string;
  value: string | number;
}

export interface AppliedTemplatePolicy {
  templateId: string;
  policyName: string;
  policyText: string;
  translation: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function decodeExistingPolicyText(policyText?: string): string {
  if (!policyText) return '';
  try {
    return decodeURIComponent(policyText);
  } catch {
    return policyText;
  }
}

function extractTemplateData(envelope: unknown): PolicyTemplateApiItem[] {
  if (!isRecord(envelope) || !Array.isArray(envelope.data)) return [];
  return envelope.data as PolicyTemplateApiItem[];
}

function extractCompiledPolicy(envelope: unknown): string {
  const data = isRecord(envelope) ? envelope.data : undefined;
  if (isRecord(data) && typeof data.contractNew === 'string') return data.contractNew;
  if (typeof data === 'string') return data;
  throw cliError('策略模板编译结果缺少 contractNew', {
    code: 1,
    details: { envelope },
  });
}

function extractTranslation(envelope: unknown): string {
  const data = isRecord(envelope) ? envelope.data : undefined;
  return typeof data === 'string' ? data : '';
}

function normalizeTemplateInput(input: PolicyTemplateApiInput): PolicyTemplateInput {
  const type: PolicyTemplateInputType =
    input.uiSectionType === 'number'
      ? 'number'
      : input.uiSectionType === 'select'
        ? 'select'
        : 'datetime';
  const isRelativeTimeEvent = input.id.includes('.RelativeTimeEvent');
  return {
    name: input.id,
    type,
    defaultValue: input.uiSectionDefaultValue,
    min: type === 'number' ? (isRelativeTimeEvent ? 1 : 0.01) : undefined,
    precision: type === 'number' ? (isRelativeTimeEvent ? 0 : 2) : undefined,
    options: input.selectOptions ?? [],
  };
}

/** Console Builder 只把 report 里的变量暴露为可编辑参数；CLI 保持同一输入集合。 */
function extractInputsFromReport(template: PolicyTemplateApiItem): PolicyTemplateInput[] {
  const uiById = new Map((template.reportUiTemplate ?? []).map((item) => [item.id, item]));
  const ids = [...template.report.matchAll(/\$\{([^}]+)\}/g)].map((match) => match[1]!.trim());
  return [...new Set(ids)]
    .map((id) => uiById.get(id) ?? { id })
    .map((item) => normalizeTemplateInput(item));
}

export function normalizePolicyTemplate(item: PolicyTemplateApiItem): PolicyTemplateSummary {
  return {
    id: item._id,
    title: item.title,
    code: item.template,
    translation: item.reportTranslate,
    inputs: extractInputsFromReport(item),
  };
}

export async function listPolicyTemplates(opts: {
  resourceTypeCodes: string[];
  nodeId?: number;
}): Promise<PolicyTemplateSummary[]> {
  const templates = await FServiceAPI.Policy.policyTemplates({
    resourceTypeCodes4Resource: opts.nodeId ? undefined : opts.resourceTypeCodes,
    resourceTypeCodes4Presentable: opts.nodeId ? opts.resourceTypeCodes : undefined,
  });
  return extractTemplateData(templates).map((item) => normalizePolicyTemplate(item));
}

export function parseTemplateParams(raw?: string | string[]): PolicyTemplateParam[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values
    .flatMap((value) => String(value).split(','))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf('=');
      if (index <= 0) {
        throw cliError('策略模板参数必须使用 key=value 格式', {
          code: 4,
          details: { value: part },
        });
      }
      return {
        name: part.slice(0, index).trim(),
        value: part.slice(index + 1).trim(),
      };
    });
}

export function encodePolicyForTranslation(policyText: string): string {
  const normalized = (policyText || '').replace(/(\t|\r)/g, ' ');
  return Buffer.from(normalized, 'utf8').toString('base64');
}

function policyNames(info: PlatformResourceInfo): string[] {
  return (info.policies ?? []).map((policy) => policy.policyName || '').filter(Boolean);
}

function policyTexts(info: PlatformResourceInfo): string[] {
  return (info.policies ?? [])
    .map((policy) => decodeExistingPolicyText((policy as { policyText?: string }).policyText))
    .filter(Boolean);
}

function assertTemplatePolicyName(name: string, info: PlatformResourceInfo): void {
  const trimmed = name.trim();
  if (!trimmed) throw cliError('请输入策略名称', { code: 4 });
  if (trimmed.length < 2) throw cliError('策略名称不少于 2 个字符', { code: 4 });
  if (trimmed.length > 20) throw cliError('策略名称不超过 20 个字符', { code: 4 });
  if (policyNames(info).includes(trimmed)) {
    throw cliError('策略名称已存在', { code: 4 });
  }
}

function assertTemplateAvailable(
  templates: PolicyTemplateSummary[],
  templateId: string,
): PolicyTemplateSummary {
  const template = templates.find((item) => item.id === templateId);
  if (!template) {
    throw cliError('当前资源类型没有这个策略模板', {
      code: 4,
      details: { templateId, availableTemplateIds: templates.map((item) => item.id) },
    });
  }
  return template;
}

async function assertTransactionTemplateAllowed(opts: {
  template: PolicyTemplateSummary;
  ownerId?: string | number;
}): Promise<void> {
  if (!opts.template.code.includes('.TransactionEvent')) return;
  const ownerId = Number(opts.ownerId);
  if (!Number.isFinite(ownerId)) {
    throw cliError('付费策略需要确认结算信息，但当前账号缺少 userId', {
      code: 5,
      hint: `${getConsoleBaseURL()}/settlementCreator`,
    });
  }
  const result = await FServiceAPI.Payment.queryWithdrawStatus({
    ownerId,
    accountType: 1,
  });
  const status = isRecord(result) && isRecord(result.data) ? Number(result.data.status) : undefined;
  if (status === 1) {
    const actionUrl = `${getConsoleBaseURL()}/settlementCreator`;
    throw cliError('付费策略需要先到 Console 补充结算信息', {
      code: 5,
      hint: `打开 ${actionUrl}，完成后重新运行 policy template apply`,
      details: { actionUrl, nextCommand: 'freelog-cli policy template apply --yes --env dev' },
    });
  }
}

export async function policyTemplateApply(opts: {
  store: ProjectStore;
  templateId: string;
  policyName?: string;
  params?: PolicyTemplateParam[];
  noAutoPull?: boolean;
}): Promise<AppliedTemplatePolicy> {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureSynced({ store: opts.store, noAutoPull: opts.noAutoPull });
  const resourceTypeCode = ctx.info.resourceTypeCode || ctx.resource.resourceTypeCode;
  if (!resourceTypeCode) {
    throw cliError('当前资源缺少 resourceTypeCode，无法加载策略模板', { code: 4 });
  }
  const applied = await applyPolicyTemplateToSubject({
    resourceId: ctx.resource.resourceId!,
    resourceTypeCode,
    ownerId: ctx.info.userId ?? ctx.resource.userId ?? ctx.auth.userId,
    existingPolicies: ctx.info.policies || [],
    templateId: opts.templateId,
    policyName: opts.policyName,
    params: opts.params,
  });
  const info = await fetchResourceInfo(ctx.resource.resourceId!);
  opts.store.savePlatformFacts(
    { ...ctx.resource, ...info },
    { remoteWriteConfirmed: true },
  );
  return applied;
}

export async function applyPolicyTemplateToSubject(opts: {
  resourceId: string;
  resourceTypeCode: string;
  ownerId?: string | number;
  existingPolicies?: PlatformResourceInfo['policies'];
  templateId: string;
  policyName?: string;
  params?: PolicyTemplateParam[];
}): Promise<AppliedTemplatePolicy> {
  const templates = await listPolicyTemplates({ resourceTypeCodes: [resourceTypeCode] });
  const template = assertTemplateAvailable(templates, opts.templateId);
  await assertTransactionTemplateAllowed({
    template,
    ownerId: opts.ownerId,
  });

  const policyName = (opts.policyName || template.title).trim();
  const infoForValidation = {
    resourceId: opts.resourceId,
    policies: opts.existingPolicies || [],
  };
  assertTemplatePolicyName(policyName, infoForValidation);

  const compiled = await FServiceAPI.Policy.policyReCompile({
    _id: template.id,
    fillArgs: opts.params ?? [],
  });
  const policyText = extractCompiledPolicy(compiled);
  if (policyTexts(infoForValidation).includes(policyText)) {
    throw cliError('策略代码已存在', {
      code: 4,
      details: { templateId: template.id, policyName },
    });
  }

  const translationEnvelope = await FServiceAPI.Policy.policyTranslation({
    contract: encodePolicyForTranslation(policyText),
  });
  const translation = extractTranslation(translationEnvelope);
  const item: PolicyFileItem = { policyName, policyText, status: 1 };
  assertNewPoliciesUnique(opts.existingPolicies || [], [item]);

  await FServiceAPI.Resource.update({
    resourceId: opts.resourceId,
    ...buildPolicyUpdatePayload([item]),
  });
  return {
    templateId: template.id,
    policyName,
    policyText,
    translation,
  };
}
