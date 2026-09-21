/** 合集自身策略：目标解析不同，模板描述、编译/翻译与单资源共用 policy/template。 */

import { FServiceAPI } from '../../platform/api';
import { CliError } from '../../core/errors';
import { normalizePolicyTemplates, compilePolicyTemplate, type PolicyTemplate, type PreparedPolicyTemplate, type TemplateParamInput } from '../policy/template';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';

export type CollectionPolicyApis = CollectionTargetApis & {
  policyTemplates?: (params?: Record<string, unknown>) => Promise<unknown>;
  policyReCompile?: (params: { _id: string; compileType: 'normal' | 'collection'; fillArgs: Array<{ name: string; value: string | number | boolean }> }) => Promise<unknown>;
  policyTranslation?: (params: { policyText: string; compileType: 'normal' | 'collection' }) => Promise<unknown>;
  update?: (params: Record<string, unknown>) => Promise<unknown>;
};

type CollectionPolicy = { policyId: string; policyName: string; policyText?: string; status: number };

function policies(info: Record<string, unknown>): CollectionPolicy[] {
  return (Array.isArray(info.policies) ? info.policies : []).flatMap((item): CollectionPolicy[] => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    if (typeof raw.policyId !== 'string' || !raw.policyId) return [];
    return [{ policyId: raw.policyId, policyName: typeof raw.policyName === 'string' && raw.policyName.trim() ? raw.policyName.trim() : raw.policyId, policyText: typeof raw.policyText === 'string' ? raw.policyText : undefined, status: Number(raw.status) === 1 ? 1 : 0 }];
  });
}

function decoded(value: string | undefined): string | undefined {
  try { return value ? decodeURIComponent(value) : value; } catch { return value; }
}

function assertWritable(info: Record<string, unknown>): void {
  if (Number(info.status) === 2) throw new CliError('冻结合集不能修改授权策略', 'COLLECTION_POLICY_FROZEN');
}

async function catalog(input: { cwd: string; selector?: string; homeDir?: string; apis?: CollectionPolicyApis }) {
  const target = await resolveCollectionTarget(input);
  const request = input.apis?.policyTemplates ?? ((params: Record<string, unknown>) => FServiceAPI.Policy.policyTemplates(params as never));
  const result = await request({}) as { data?: unknown } | unknown[];
  const data = Array.isArray(result) ? result : (result as { data?: unknown }).data;
  const list = Array.isArray(data) ? data : data && typeof data === 'object'
    ? ((data as Record<string, unknown>).list ?? (data as Record<string, unknown>).dataList ?? (data as Record<string, unknown>).templates)
    : undefined;
  if (!Array.isArray(list)) throw new CliError('策略模板列表响应格式无效', 'POLICY_TEMPLATE_RESPONSE_INVALID');
  // 服务端暂不支持以合集主体筛选，仍完整请求 {}；本地仅去掉无法用于合集编译的
  // normal 模板，保留所有 collection 模板（不按免费/付费等运营标签过滤）。
  return { target, templates: normalizePolicyTemplates(list).filter((template) => template.compileType === 'collection') };
}

/** 读取当前合集的完整模板快照；当前后端筛选未稳定，固定请求 {}。 */
export async function getCollectionPolicyTemplateCatalog(input: { cwd: string; selector?: string; homeDir?: string; apis?: CollectionPolicyApis }): Promise<{ subject: { kind: 'collection'; resourceId: string; typeCode: string }; templates: PolicyTemplate[] }> {
  const result = await catalog(input);
  return { subject: { kind: 'collection', resourceId: result.target.resourceId, typeCode: result.target.typeCode }, templates: result.templates };
}

/** 从最新合集模板快照精确读取一条模板。 */
export async function getCollectionPolicyTemplateInfo(input: { cwd: string; selector?: string; templateId: string; homeDir?: string; apis?: CollectionPolicyApis }) {
  const result = await getCollectionPolicyTemplateCatalog(input);
  const template = result.templates.find((item) => item.id === input.templateId);
  if (!template) throw new CliError('指定模板不在当前模板列表中', 'POLICY_TEMPLATE_INVALID');
  return { subject: result.subject, template };
}

/** 指纹一致后编译并翻译合集策略；整个阶段无写入。 */
export async function prepareCollectionPolicyTemplate(input: { cwd: string; selector?: string; templateId: string; expectedFingerprint: string; params: TemplateParamInput[]; requireEveryParam: boolean; homeDir?: string; apis?: CollectionPolicyApis }): Promise<PreparedPolicyTemplate> {
  const result = await getCollectionPolicyTemplateInfo(input);
  if (result.template.fingerprint !== input.expectedFingerprint) throw new CliError('策略模板已变化；请重新查看并选择模板', 'POLICY_TEMPLATE_CHANGED');
  const reCompile = input.apis?.policyReCompile ?? ((params: { _id: string; compileType: 'normal' | 'collection'; fillArgs: Array<{ name: string; value: string | number | boolean }> }) => FServiceAPI.Policy.policyReCompile(params));
  const translate = input.apis?.policyTranslation ?? ((params: { policyText: string; compileType: 'normal' | 'collection' }) => FServiceAPI.Policy.policyTranslation(params));
  return compilePolicyTemplate({ template: result.template, params: input.params, requireEveryParam: input.requireEveryParam, reCompile, translate });
}

/** 创建并读回合集自身策略；与单资源写入 payload 保持同形。 */
export async function applyCollectionPolicy(input: { cwd: string; selector?: string; policyName: string; policyText: string; homeDir?: string; apis?: CollectionPolicyApis }): Promise<void> {
  const target = await resolveCollectionTarget(input);
  assertWritable(target.info);
  const name = input.policyName.trim();
  if (Array.from(name).length < 2 || Array.from(name).length > 20) throw new CliError('策略名须为 2–20 个字符', 'POLICY_NAME_INVALID');
  const text = input.policyText.trim();
  if (!text) throw new CliError('策略文本不能为空', 'POLICY_TEXT_REQUIRED');
  const exists = (info: Record<string, unknown>) => policies(info).some((item) => item.policyName === name || decoded(item.policyText) === text);
  if (exists(target.info)) throw new CliError('合集已存在同名或同正文授权策略', 'POLICY_DUPLICATE');
  const update = input.apis?.update ?? ((params: Record<string, unknown>) => FServiceAPI.Resource.update(params as never));
  const verify = async () => {
    const after = await resolveCollectionTarget(input);
    // 服务端会规范化 DSL；读回必须确认策略身份和启用状态，但不比较规范化前后的正文。
    return policies(after.info).some((item) => item.policyName === name && item.status === 1);
  };
  try {
    await update({ resourceId: target.resourceId, addPolicies: [{ policyName: name, policyText: encodeURIComponent(text), status: 1 }] });
  } catch (error) {
    try { if (await verify()) return; } catch { /* 保留原始写错误。 */ }
    throw error;
  }
  if (!await verify()) throw new CliError('合集策略创建后读回不一致', 'COLLECTION_POLICY_VERIFY_FAILED');
}

/** 显式启用或停用合集自身策略，并保留上架时最后一条启用策略门禁。 */
export async function setCollectionPolicy(input: { cwd: string; selector?: string; policyId: string; on: boolean; homeDir?: string; apis?: CollectionPolicyApis }): Promise<void> {
  const target = await resolveCollectionTarget(input); assertWritable(target.info);
  const current = policies(target.info); const chosen = current.find((item) => item.policyId === input.policyId);
  if (!chosen) throw new CliError('指定策略不属于当前合集', 'POLICY_NOT_FOUND');
  if (!input.on && Number(target.info.status) === 1 && chosen.status === 1 && current.filter((item) => item.status === 1).length <= 1) {
    throw new CliError('上架合集至少保留一条启用策略', 'POLICY_LAST_ENABLED');
  }
  const payload = { resourceId: target.resourceId, updatePolicies: [{ policyId: chosen.policyId, status: input.on ? 1 : 0 }] };
  const update = input.apis?.update ?? ((params: Record<string, unknown>) => FServiceAPI.Resource.update(params as never));
  const verify = async () => {
    const after = await resolveCollectionTarget(input);
    return policies(after.info).find((item) => item.policyId === chosen.policyId)?.status === (input.on ? 1 : 0);
  };
  try {
    await update(payload);
  } catch (originalError) {
    try { if (await verify()) return; } catch { /* 保留原始写错误。 */ }
    throw originalError;
  }
  if (!await verify()) throw new CliError('合集策略启停后读回不一致', 'COLLECTION_POLICY_SET_VERIFY_FAILED');
}

/** 读取合集自身的全部策略；策略数量小，不分页。 */
export async function getCollectionPolicyList(input: { cwd: string; selector?: string; homeDir?: string; apis?: CollectionPolicyApis }): Promise<CollectionPolicy[]> {
  return policies((await resolveCollectionTarget(input)).info);
}
