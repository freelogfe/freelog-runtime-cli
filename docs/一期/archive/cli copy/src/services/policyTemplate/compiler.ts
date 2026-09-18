import { createHash } from 'node:crypto';
import { getConsoleBaseURL } from '../../core/env.js';
import { cliError } from '../../i18n/cliError.js';
import { FServiceAPI } from '../../platform/index.js';
import {
  assertNewPoliciesUnique,
  buildPolicyUpdatePayload,
  type PolicyFileItem,
} from '../policyService.js';
import type { PlatformResourceInfo } from '../sync/index.js';
import { extractTemplateData, normalizePolicyTemplate } from './normalize.js';
import {
  assertTemplatePolicyName,
  normalizePolicyTemplateParams,
} from './params.js';
import type {
  AppliedTemplatePolicy,
  PolicyTemplateParam,
  PolicyTemplatePreview,
  PolicyTemplateSummary,
} from './types.js';
import { isRecord } from './utils.js';

/**
 * Console 同源策略模板 Builder 的业务内核。
 *
 * 这一层只处理平台模板 API、模板编译、译文预览、重复检测和最终 addPolicies payload；
 * 不读取 argv、不做 TTY prompt，也不直接保存本地 manifest/state。资源工程、session 和合集
 * 都应复用这里，避免把 Console 的 fPolicyBuilder3 规则复制成多份。
 */
function decodeExistingPolicyText(policyText?: string): string {
  if (!policyText) return '';
  try {
    return decodeURIComponent(policyText);
  } catch {
    return policyText;
  }
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

function policyTexts(info: { policies?: PlatformResourceInfo['policies'] }): string[] {
  return (info.policies ?? [])
    .map((policy) => decodeExistingPolicyText((policy as { policyText?: string }).policyText))
    .filter(Boolean);
}

function digestPolicyText(policyText: string): string {
  return createHash('sha256').update(policyText, 'utf8').digest('hex');
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

export function encodePolicyForTranslation(policyText: string): string {
  const normalized = (policyText || '').replace(/(\t|\r)/g, ' ');
  return Buffer.from(normalized, 'utf8').toString('base64');
}

export async function compilePolicyTemplateForSubject(opts: {
  resourceTypeCode: string;
  ownerId?: string | number;
  existingPolicies?: PlatformResourceInfo['policies'];
  templateId: string;
  policyName?: string;
  params?: PolicyTemplateParam[];
}): Promise<PolicyTemplatePreview> {
  const templates = await listPolicyTemplates({ resourceTypeCodes: [opts.resourceTypeCode] });
  const template = assertTemplateAvailable(templates, opts.templateId);
  await assertTransactionTemplateAllowed({
    template,
    ownerId: opts.ownerId,
  });

  const policyName = (opts.policyName || template.title).trim();
  const infoForValidation = { policies: opts.existingPolicies || [] };
  assertTemplatePolicyName(policyName, infoForValidation);

  const fillArgs = normalizePolicyTemplateParams(template, opts.params);
  const compiled = await FServiceAPI.Policy.policyReCompile({
    _id: template.id,
    fillArgs,
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
  return {
    templateId: template.id,
    templateTitle: template.title,
    policyName,
    policyText,
    translation,
    params: fillArgs,
    codeDigest: digestPolicyText(policyText),
  };
}

export async function applyCompiledPolicyToSubject(opts: {
  resourceId: string;
  existingPolicies?: PlatformResourceInfo['policies'];
  preview: Pick<PolicyTemplatePreview, 'policyName' | 'policyText'>;
}): Promise<void> {
  const item: PolicyFileItem = {
    policyName: opts.preview.policyName,
    policyText: opts.preview.policyText,
    status: 1,
  };
  assertNewPoliciesUnique(opts.existingPolicies || [], [item]);
  await FServiceAPI.Resource.update({
    resourceId: opts.resourceId,
    ...buildPolicyUpdatePayload([item]),
  });
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
  const preview = await compilePolicyTemplateForSubject(opts);
  await applyCompiledPolicyToSubject({
    resourceId: opts.resourceId,
    existingPolicies: opts.existingPolicies || [],
    preview,
  });
  return preview;
}
