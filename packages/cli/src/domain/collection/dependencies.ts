/** 合集自身的直接依赖：签约乙方固定为合集 ID，结果只写本地表单。 */

import semver from 'semver';
import { CliError } from '../../core/errors';
import { confirmWrite, isInteractive, selectQuestion } from '../../core/tty';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';
import { mutateCollectionFormDraft, readCollectionFormDraft } from './form';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';

export type CollectionDepApis = CollectionTargetApis & {
  targetInfo?: (params: Record<string, unknown>) => Promise<unknown>;
  getVersions?: (params: Record<string, unknown>) => Promise<unknown>;
  cycleCheck?: (params: Record<string, unknown>) => Promise<unknown>;
  getContracts?: (params: Record<string, unknown>) => Promise<unknown>;
  sign?: (params: Record<string, unknown>) => Promise<unknown>;
};
function data(value: unknown): unknown { return (value as { data?: unknown }).data ?? value; }
function list(value: unknown): Record<string, unknown>[] {
  const raw = data(value);
  const items = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? ((raw as { dataList?: unknown; list?: unknown }).dataList ?? (raw as { list?: unknown }).list) : undefined;
  return Array.isArray(items) ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
}
function isSingleResource(value: unknown): boolean { const all = Array.isArray(value) ? value : [value]; return all.some((item) => Number(item) === 1); }
function statusAllowed(status: unknown): boolean { return Number(status) === 1 || Number(status) === 4; }

async function targetFacts(source: string, collectionId: string, apis: CollectionDepApis): Promise<{ id: string; latest: string; policies: Array<{ policyId: string; policyName?: string }> }> {
  const get = apis.targetInfo ?? ((params) => FServiceAPI.Resource.info(params as never));
  const raw = data(await get({ resourceIdOrName: source, isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 }));
  if (!raw || typeof raw !== 'object') throw new CliError('依赖资源响应格式无效', 'COLLECTION_DEP_TARGET_INVALID');
  const info = raw as Record<string, unknown>; const id = typeof info.resourceId === 'string' ? info.resourceId : '';
  if (!id || id === collectionId || !isSingleResource(info.subjectType)) throw new CliError('依赖目标必须是其他已发布单资源', 'COLLECTION_DEP_TARGET_INVALID');
  const latest = typeof info.latestVersion === 'string' ? info.latestVersion : '';
  if (!semver.valid(latest) || !statusAllowed(info.status)) throw new CliError('依赖目标必须有已发布且可用的版本', 'COLLECTION_DEP_TARGET_UNAVAILABLE');
  const policies = Array.isArray(info.policies) ? info.policies.flatMap((item): Array<{ policyId: string; policyName?: string }> => {
    if (!item || typeof item !== 'object') return []; const policy = item as Record<string, unknown>;
    return Number(policy.status) === 1 && typeof policy.policyId === 'string' ? [{ policyId: policy.policyId, ...(typeof policy.policyName === 'string' ? { policyName: policy.policyName } : {}) }] : [];
  }) : [];
  return { id, latest, policies };
}

async function assertRange(resourceId: string, latest: string, range: string, apis: CollectionDepApis): Promise<void> {
  if (!semver.validRange(range)) throw new CliError('依赖版本范围无效', 'COLLECTION_DEP_RANGE_INVALID');
  const getVersions = apis.getVersions ?? ((params) => FServiceAPI.Resource.getVersionListByResourceID(params as never));
  const versions = list(await getVersions({ resourceId })).map((item) => typeof item.version === 'string' ? item.version : '').filter((value) => semver.valid(value));
  if (!versions.includes(latest) || !semver.maxSatisfying(versions, range)) throw new CliError('依赖范围没有命中目标已发布版本', 'COLLECTION_DEP_RANGE_INVALID');
}

async function choosePolicy(policies: Array<{ policyId: string; policyName?: string }>, policyId: string | undefined, yes: boolean | undefined): Promise<string> {
  if (policyId) { if (!policies.some((item) => item.policyId === policyId)) throw new CliError('指定策略不是目标当前可签策略', 'COLLECTION_DEP_POLICY_INVALID'); return policyId; }
  if (yes || !isInteractive()) throw new CliError('未授权依赖请显式提供 --policy', 'COLLECTION_DEP_POLICY_REQUIRED');
  if (policies.length === 0) throw new CliError('目标没有可签策略', 'COLLECTION_DEP_POLICY_NONE');
  return selectQuestion('选择依赖签约策略', policies.map((item) => ({ name: `${item.policyName ?? '未命名策略'} (${item.policyId})`, value: item.policyId })));
}

/** 添加/改范围都走真实版本、环、合集身份合同校验；签约成功即继续，不为支付阻塞。 */
export async function addCollectionDependency(input: {
  cwd: string; selector?: string; source: string; range?: string; policyId?: string; yes?: boolean; homeDir?: string; apis?: CollectionDepApis;
}): Promise<{ resourceId: string; versionRange: string; signed: boolean }> {
  assertPlatformAllowed();
  const target = await resolveCollectionTarget(input);
  if (Number(target.info.status) === 2 || target.info.rssSource === 'yes' || (typeof target.info.feedUrl === 'string' && target.info.feedUrl.trim())) throw new CliError('当前合集不可维护直接依赖', 'COLLECTION_DEP_COLLECTION_UNWRITABLE');
  const apis = input.apis ?? {};
  const source = input.source.replace(/^(id:|name:)/, '').trim();
  if (!source) throw new CliError('请提供依赖单资源 id: 或 name:', 'COLLECTION_DEP_TARGET_INVALID');
  const fact = await targetFacts(source, target.resourceId, apis); const range = input.range ?? `^${fact.latest}`;
  await assertRange(fact.id, fact.latest, range, apis);
  const draft = readCollectionFormDraft(input.cwd, target.resourceId);
  if (!draft) throw new CliError('没有本地合集表单草稿，请先 collection form pull', 'COLLECTION_FORM_DRAFT_MISSING');
  const cycle = apis.cycleCheck ?? ((params) => FServiceAPI.Resource.cycleDependencyCheck(params as never));
  const result = data(await cycle({ resourceId: target.resourceId, dependencies: [...draft.form.dependencies.filter((item) => item.resourceId !== fact.id), { resourceId: fact.id, versionRange: range }] }));
  if (result === false || result && typeof result === 'object' && ((result as Record<string, unknown>).isCycle === true || (result as Record<string, unknown>).result === false)) throw new CliError('添加此依赖会形成循环依赖', 'COLLECTION_DEP_CYCLE');
  const contracts = apis.getContracts ?? ((params) => FServiceAPI.Contract.batchContracts(params as never));
  const exists = list(await contracts({ subjectIds: fact.id, subjectType: 1, licenseeId: target.resourceId, licenseeIdentityType: 1, isLoadPolicyInfo: 1 })).some((item) => String(item.subjectId ?? item.resourceId ?? '') === fact.id && Boolean(item.contractId ?? item.id));
  let signed = false;
  if (!exists) {
    const policyId = await choosePolicy(fact.policies, input.policyId, input.yes);
    await confirmWrite(`为合集 ${target.resourceName} 添加直接依赖\n${fact.id}@${range}\n策略：${policyId}`, input.yes);
    const sign = apis.sign ?? ((params) => FServiceAPI.Contract.batchCreateContracts(params as never));
    await sign({ subjects: [{ subjectId: fact.id, policyId, subjectType: 1 }], subjectType: 1, licenseeId: target.resourceId, licenseeIdentityType: 1 }); signed = true;
  }
  mutateCollectionFormDraft(input.cwd, target.resourceId, (form) => ({ ...form, dependencies: [...form.dependencies.filter((item) => item.resourceId !== fact.id), { resourceId: fact.id, versionRange: range }] }));
  return { resourceId: fact.id, versionRange: range, signed };
}

/** 从本地表单移除一条直接依赖；不会取消已签合同或发布。 */
export async function removeCollectionDependency(input: { cwd: string; selector?: string; resourceId: string; homeDir?: string; apis?: CollectionDepApis }): Promise<void> {
  const target = await resolveCollectionTarget(input);
  const draft = readCollectionFormDraft(input.cwd, target.resourceId); if (!draft || !draft.form.dependencies.some((item) => item.resourceId === input.resourceId)) throw new CliError('本地表单中没有该依赖', 'COLLECTION_DEP_NOT_FOUND');
  mutateCollectionFormDraft(input.cwd, target.resourceId, (form) => ({ ...form, dependencies: form.dependencies.filter((item) => item.resourceId !== input.resourceId) }));
}

/** 列出当前本地表单的待发布直接依赖。 */
export async function listCollectionDependencies(input: { cwd: string; selector?: string; homeDir?: string; apis?: CollectionDepApis }): Promise<Array<{ resourceId: string; versionRange: string }>> {
  const target = await resolveCollectionTarget(input); const draft = readCollectionFormDraft(input.cwd, target.resourceId);
  if (!draft) throw new CliError('没有本地合集表单草稿，请先 collection form pull', 'COLLECTION_FORM_DRAFT_MISSING'); return draft.form.dependencies;
}
