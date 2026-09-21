/** 资源自身授权策略：按类型列模板、追加、开关；不处理依赖签约或支付。 */

import { FServiceAPI } from '../../platform/api';
import { CliError } from '../../core/errors';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { unwrapData, unwrapList } from '../../platform/unwrap';
import { assertRemoteResourceWritable, resolveBoundIdentity } from '../version/gates';
import { getTypeHierarchy, type TypeApis } from '../create/typePick';
import {
  compilePolicyTemplate,
  normalizePolicyTemplates,
  type PreparedPolicyTemplate,
  type PolicyTemplate,
  type TemplateParamInput,
} from './template';

export type { PolicyTemplate, PreparedPolicyTemplate, TemplateParamInput, TemplateValue } from './template';

export type PolicyApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  policyTemplates?: (params?: Record<string, unknown>) => Promise<unknown>;
  policyReCompile?: (params: {
    _id: string;
    compileType: 'normal' | 'collection';
    fillArgs: Array<{ name: string; value: string | number | boolean }>;
  }) => Promise<unknown>;
  policyTranslation?: (params: { policyText: string; compileType: 'normal' | 'collection' }) => Promise<unknown>;
  update?: (params: Record<string, unknown>) => Promise<unknown>;
  /** 只读类型树，用于 policy list 展示当前叶子至根的完整链。 */
  resourceTypes?: TypeApis['resourceTypes'];
};

export type ResourcePolicy = {
  policyId: string;
  policyName: string;
  policyText?: string;
  status: number;
};

export type PolicyList = {
  typeHierarchy: string[];
  policies: ResourcePolicy[];
};

export type PolicyTemplatePage = {
  page: number;
  pageCount: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  items: PolicyTemplate[];
};

/** 平台策略模板固定每页 20 条；资源自身策略不分页，始终一次展示全部。 */
export const POLICY_TEMPLATE_PAGE_SIZE = 20;

type PolicyContext = {
  resourceId: string;
  typeCode: string;
  info: Record<string, unknown>;
  policies: ResourcePolicy[];
};

function infoApi(apis?: PolicyApis): (params: Record<string, unknown>) => Promise<unknown> {
  return apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
}

function updateApi(apis?: PolicyApis): (params: Record<string, unknown>) => Promise<unknown> {
  return apis?.update ?? ((params) => FServiceAPI.Resource.update(params as never));
}

function readPolicies(info: Record<string, unknown>): ResourcePolicy[] {
  const source = Array.isArray(info.policies) ? info.policies : [];
  return source.flatMap((item): ResourcePolicy[] => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    if (typeof raw.policyId !== 'string' || !raw.policyId) return [];
    return [{
      policyId: raw.policyId,
      policyName: typeof raw.policyName === 'string' && raw.policyName.trim()
        ? raw.policyName.trim()
        : raw.policyId,
      ...(typeof raw.policyText === 'string' ? { policyText: raw.policyText } : {}),
      status: raw.status === 1 ? 1 : 0,
    }];
  });
}

function decoded(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function assertEditable(info: Record<string, unknown>, authUserId: number, resourceId: string): void {
  assertRemoteResourceWritable({
    info,
    resourceId,
    authUserId,
    codes: {
      invalid: 'POLICY_INFO_INVALID',
      notOwner: 'POLICY_NOT_OWNER',
      frozen: 'POLICY_RESOURCE_FROZEN',
    },
  });
}

async function loadPolicyContext(input: {
  cwd: string;
  file?: string;
  homeDir?: string;
  apis?: PolicyApis;
  editable?: boolean;
}): Promise<PolicyContext> {
  assertPlatformAllowed();
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const resourceId = identity.resourceId;
  if (!resourceId) {
    throw new CliError('当前身份尚未绑定线上资源', 'POLICY_RESOURCE_REQUIRED');
  }
  const typeCode = identity.typeCode;
  if (!typeCode) {
    throw new CliError('当前资源缺少资源类型，不能查询策略模板', 'POLICY_TYPE_REQUIRED');
  }
  const info = unwrapData(await infoApi(input.apis)({
    resourceIdOrName: resourceId,
    isLoadPolicyInfo: 1,
  }));
  if (input.editable) assertEditable(info, auth.userId, resourceId);
  return {
    resourceId,
    typeCode,
    info,
    policies: readPolicies(info),
  };
}

/**
 * 暂时请求平台返回的全部模板：当前接口传入 resourceTypeCodes4Resource 会导致模板
 * 被错误过滤。后端即将增加主体和类型筛选能力；正式契约确认前固定请求 {}，本地
 * 也不按免费 / 付费 / TransactionEvent 过滤。
 */
export async function getPolicyTemplates(input: {
  cwd: string;
  file?: string;
  homeDir?: string;
  apis?: PolicyApis;
}): Promise<PolicyTemplate[]> {
  return (await getPolicyTemplateCatalog(input)).templates;
}

export type PolicyTemplateCatalog = {
  subject: { kind: 'resource'; resourceId: string; typeCode: string };
  templates: PolicyTemplate[];
};

/** 当前资源与完整模板快照；用于 --json 的稳定机器目录。 */
export async function getPolicyTemplateCatalog(input: {
  cwd: string;
  file?: string;
  homeDir?: string;
  apis?: PolicyApis;
}): Promise<PolicyTemplateCatalog> {
  const context = await loadPolicyContext(input);
  const request = input.apis?.policyTemplates
    ?? ((params: Record<string, unknown>) => FServiceAPI.Policy.policyTemplates(params as never));
  const rawList = unwrapList(await request({}), ['list', 'dataList', 'templates']);
  return {
    subject: { kind: 'resource', resourceId: context.resourceId, typeCode: context.typeCode },
    // 当前服务端尚不能按主体筛选，故请求仍固定为 {}；但 normal / collection 的
    // 编译目标不能混用。这里保留所有“单资源可用”的 normal 模板，不再以免费等
    // 运营标签做二次过滤。
    templates: normalizePolicyTemplates(rawList).filter((template) => template.compileType === 'normal'),
  };
}

/** 只读定位单模板；用于人工查看或脚本刷新已选择的模板。 */
export async function getPolicyTemplateInfo(input: {
  cwd: string;
  file?: string;
  templateId: string;
  homeDir?: string;
  apis?: PolicyApis;
}): Promise<{ subject: PolicyTemplateCatalog['subject']; template: PolicyTemplate }> {
  const catalog = await getPolicyTemplateCatalog(input);
  const template = catalog.templates.find((item) => item.id === input.templateId);
  if (!template) throw new CliError('指定模板不在当前模板列表中', 'POLICY_TEMPLATE_INVALID');
  return { subject: catalog.subject, template };
}

/**
 * 重新拉取模板、比对指纹、编译并翻译。这里没有写入；命令层可安全地在预览后取消。
 * 交互模式也传入“选择时”的指纹，防止用户编辑期间后台改动字段顺序。
 */
export async function preparePolicyTemplate(input: {
  cwd: string;
  file?: string;
  templateId: string;
  expectedFingerprint: string;
  params: TemplateParamInput[];
  requireEveryParam: boolean;
  homeDir?: string;
  apis?: PolicyApis;
}): Promise<PreparedPolicyTemplate> {
  const template = (await getPolicyTemplates(input)).find((item) => item.id === input.templateId);
  if (!template) throw new CliError('指定模板不在当前模板列表中', 'POLICY_TEMPLATE_INVALID');
  if (template.fingerprint !== input.expectedFingerprint) {
    throw new CliError('策略模板已变化；请重新查看并选择模板', 'POLICY_TEMPLATE_CHANGED');
  }
  const request = input.apis?.policyReCompile
    ?? ((params: {
      _id: string;
      compileType: 'normal' | 'collection';
      fillArgs: Array<{ name: string; value: string | number | boolean }>;
    }) => FServiceAPI.Policy.policyReCompile(params));
  const translate = input.apis?.policyTranslation
    ?? ((params: { policyText: string; compileType: 'normal' | 'collection' }) => FServiceAPI.Policy.policyTranslation(params));
  return compilePolicyTemplate({
    template,
    params: input.params,
    requireEveryParam: input.requireEveryParam,
    reCompile: request,
    translate,
  });
}

/** 读取本资源策略及最终叶子到根的完整类型链；全程只读。 */
export async function getPolicyList(input: {
  cwd: string;
  file?: string;
  homeDir?: string;
  apis?: PolicyApis;
}): Promise<PolicyList> {
  const context = await loadPolicyContext(input);
  const typeHierarchy = await getTypeHierarchy(context.typeCode, input.apis);
  return {
    typeHierarchy,
    policies: [...context.policies]
      .sort((a, b) => b.status - a.status || a.policyName.localeCompare(b.policyName)),
  };
}

/** 资源自身策略列表：完整类型链 + 全部策略。策略数量很小，不提供分页。 */
export function formatPolicyList(list: PolicyList): string {
  const header = [
    `资源类型：${list.typeHierarchy.join(' / ')}`,
    `共 ${list.policies.length} 条授权策略`,
  ];
  if (list.policies.length === 0) return [...header, '还没有授权策略'].join('\n');
  return [
    ...header,
    ...list.policies.map((item) => `${item.policyId}\t${item.policyName}\t${item.status === 1 ? 'on' : 'off'}`),
  ].join('\n');
}

/** 平台模板在内存快照上固定分页；切页不重复请求平台。 */
export function policyTemplatePage(templates: readonly PolicyTemplate[], page: number): PolicyTemplatePage {
  const pageCount = Math.max(1, Math.ceil(templates.length / POLICY_TEMPLATE_PAGE_SIZE));
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new CliError(`策略模板页码超出范围，当前共 ${pageCount} 页`, 'POLICY_TEMPLATE_PAGE');
  }
  return {
    page,
    pageCount,
    total: templates.length,
    hasPrevious: page > 1,
    hasNext: page < pageCount,
    items: templates.slice((page - 1) * POLICY_TEMPLATE_PAGE_SIZE, page * POLICY_TEMPLATE_PAGE_SIZE),
  };
}

/** 单个策略模板页面：模板与资源自身策略是两套列表语义。 */
export function formatPolicyTemplatePage(page: PolicyTemplatePage): string {
  const header = `第 ${page.page}/${page.pageCount} 页，共 ${page.total} 个授权策略模板`;
  if (page.items.length === 0) return `${header}\n没有可用授权策略模板`;
  return [
    header,
    ...page.items.map((item) => [item.id, item.name, item.summary].filter(Boolean).join('\t')),
  ].join('\n');
}

function assertPolicyInput(context: PolicyContext, policyName: string, policyText: string): { name: string; text: string } {
  const name = policyName.trim();
  const text = policyText.trim();
  if (Array.from(name).length < 2 || Array.from(name).length > 20) {
    throw new CliError('策略名须为 2–20 个字符', 'POLICY_NAME_INVALID');
  }
  if (!text) throw new CliError('策略文本不能为空', 'POLICY_TEXT_REQUIRED');
  if (context.policies.some((item) => item.policyName === name)) {
    throw new CliError('当前资源已存在同名授权策略', 'POLICY_NAME_DUPLICATE');
  }
  if (context.policies.some((item) => decoded(item.policyText) === text)) {
    throw new CliError('当前资源已存在相同授权策略文本', 'POLICY_TEXT_DUPLICATE');
  }
  return { name, text };
}

/** 追加并启用一条策略。交易事件不在 CLI 过滤，由平台做语义校验。 */
export async function applyPolicy(input: {
  cwd: string;
  file?: string;
  policyName: string;
  policyText: string;
  homeDir?: string;
  apis?: PolicyApis;
}): Promise<void> {
  const context = await loadPolicyContext({ ...input, editable: true });
  const policy = assertPolicyInput(context, input.policyName, input.policyText);
  const payload = {
    resourceId: context.resourceId,
    addPolicies: [{
      policyName: policy.name,
      policyText: encodeURIComponent(policy.text),
      status: 1,
    }],
  };
  const verify = async (): Promise<boolean> => {
    const after = await loadPolicyContext({ ...input, editable: true });
    // 平台会规范化策略 DSL，且读接口可返回译文；不能将读回文本与编译前的原文
    // 作字节级比较。编译、翻译和写接口已经校验语义，读回只确认新策略身份及启用状态。
    return after.policies.some((item) => item.policyName === policy.name && item.status === 1);
  };
  try {
    await updateApi(input.apis)(payload);
  } catch (originalError) {
    try {
      if (await verify()) return;
    } catch {
      // 请求结果未知时只能尝试读回一次；读回也失败则保留写入错误。
    }
    throw originalError;
  }
  if (!await verify()) {
    throw new CliError('策略创建后读回不一致', 'POLICY_CREATE_VERIFY_FAILED');
  }
}

/** 策略开关；停用已上架资源的最后一条启用策略在本地直接拒绝。 */
export async function setPolicy(input: {
  cwd: string;
  file?: string;
  policyId: string;
  on: boolean;
  homeDir?: string;
  apis?: PolicyApis;
}): Promise<void> {
  const context = await loadPolicyContext({ ...input, editable: true });
  const target = context.policies.find((item) => item.policyId === input.policyId);
  if (!target) throw new CliError('指定策略不属于当前资源', 'POLICY_NOT_FOUND');
  const enabledCount = context.policies.filter((item) => item.status === 1).length;
  if (!input.on && context.info.status === 1 && target.status === 1 && enabledCount <= 1) {
    throw new CliError('上架资源至少保留一条启用策略', 'POLICY_LAST_ENABLED');
  }
  const payload = { resourceId: context.resourceId, updatePolicies: [{ policyId: target.policyId, status: input.on ? 1 : 0 }] };
  const verify = async (): Promise<boolean> => {
    const after = await loadPolicyContext({ ...input, editable: true });
    return after.policies.find((item) => item.policyId === target.policyId)?.status === (input.on ? 1 : 0);
  };
  try {
    await updateApi(input.apis)(payload);
  } catch (originalError) {
    try { if (await verify()) return; } catch { /* 保留原始写错误。 */ }
    throw originalError;
  }
  if (!await verify()) throw new CliError('策略启停后读回不一致', 'POLICY_SET_VERIFY_FAILED');
}
