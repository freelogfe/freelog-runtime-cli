/** 合集自身策略：目标解析不同，模板描述、编译/翻译与单资源共用 policy/template。 */

import { FServiceAPI } from '../../platform/api';
import { CliError } from '../../core/errors';
import { parsePolicyTemplateCatalog, compilePolicyTemplate, type PolicyTemplate, type PreparedPolicyTemplate, type TemplateParamInput } from '../policy/template';
import { appendPolicy, togglePolicy } from '../policy/mutation';
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
  // 服务端暂不支持以合集主体筛选，仍完整请求 {}；本地仅去掉无法用于合集编译的
  // normal 模板，保留所有 collection 模板（不按免费/付费等运营标签过滤）。
  return { target, templates: parsePolicyTemplateCatalog(await request({}), 'collection') };
}

/** 读取当前合集的完整模板快照；当前后端筛选未稳定，固定请求 {}。 */
export async function getCollectionPolicyTemplateCatalog(input: { cwd: string; selector?: string; homeDir?: string; apis?: CollectionPolicyApis }): Promise<{ subject: { kind: 'collection'; resourceId: string; typeCode: string }; templates: PolicyTemplate[]; policyNames: string[] }> {
  const result = await catalog(input);
  return { subject: { kind: 'collection', resourceId: result.target.resourceId, typeCode: result.target.typeCode }, templates: result.templates, policyNames: policies(result.target.info).map((policy) => policy.policyName) };
}

/** 从最新合集模板快照精确读取一条模板。 */
export async function getCollectionPolicyTemplateInfo(input: { cwd: string; selector?: string; templateId: string; homeDir?: string; apis?: CollectionPolicyApis }) {
  const result = await getCollectionPolicyTemplateCatalog(input);
  const template = result.templates.find((item) => item.id === input.templateId);
  if (!template) throw new CliError('指定模板不在当前模板列表中', 'POLICY_TEMPLATE_INVALID');
  return { subject: result.subject, template, policyNames: result.policyNames };
}

/** 指纹一致后编译并翻译合集策略；整个阶段无写入。 */
export async function prepareCollectionPolicyTemplate(input: { cwd: string; selector?: string; templateId: string; policyName?: string; expectedFingerprint: string; params: TemplateParamInput[]; requireEveryParam: boolean; homeDir?: string; apis?: CollectionPolicyApis }): Promise<PreparedPolicyTemplate> {
  const result = await getCollectionPolicyTemplateInfo(input);
  if (input.policyName && result.policyNames.includes(input.policyName.trim())) throw new CliError('当前合集已存在同名授权策略', 'POLICY_NAME_DUPLICATE');
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
  await appendPolicy({
    subject: '合集', resourceId: target.resourceId, policyName: name, policyText: text, update,
    read: async () => policies((await resolveCollectionTarget(input)).info),
  });
}

/** 显式启用或停用合集自身策略，并保留上架时最后一条启用策略门禁。 */
export async function setCollectionPolicy(input: { cwd: string; selector?: string; policyId: string; on: boolean; homeDir?: string; apis?: CollectionPolicyApis }): Promise<void> {
  const target = await resolveCollectionTarget(input); assertWritable(target.info);
  const update = input.apis?.update ?? ((params: Record<string, unknown>) => FServiceAPI.Resource.update(params as never));
  await togglePolicy({
    subject: '合集', resourceId: target.resourceId, policyId: input.policyId, on: input.on,
    resourceStatus: Number(target.info.status), policies: policies(target.info), update,
    read: async () => policies((await resolveCollectionTarget(input)).info),
    verifyCode: 'COLLECTION_POLICY_SET_VERIFY_FAILED',
  });
}

/** 读取合集自身的全部策略；策略数量小，不分页。 */
export async function getCollectionPolicyList(input: { cwd: string; selector?: string; homeDir?: string; apis?: CollectionPolicyApis }): Promise<CollectionPolicy[]> {
  return policies((await resolveCollectionTarget(input)).info);
}
