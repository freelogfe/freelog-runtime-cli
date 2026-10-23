/** 合集自身的直接依赖：只声明到本地表单，不自动签约或支付。 */

import semver from 'semver';
import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';
import { mutateCollectionFormDraft, readCollectionFormDraft } from './form';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';

export type CollectionDepApis = CollectionTargetApis & {
  targetInfo?: (params: Record<string, unknown>) => Promise<unknown>;
  getVersions?: (params: Record<string, unknown>) => Promise<unknown>;
  cycleCheck?: (params: Record<string, unknown>) => Promise<unknown>;
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const succeeded = (value: unknown): value is Record<string, unknown> => record(value) && value.ret === 0 && value.errCode === 0;
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_.-]+$/u.test(value)
  && !/[\s\p{Cc}\p{Cf}]/u.test(value) && value !== '.' && value !== '..';
type Source = { kind: 'id' | 'name'; value: string };

function parseSource(raw: string): Source {
  const kind = raw.startsWith('name:') || (!raw.includes(':') && raw.includes('/')) ? 'name' : 'id';
  const value = raw.replace(/^(id:|name:)/, '');
  const valid = kind === 'id' ? validId(value) : /^[^\s/:]+\/[^\s/:]+$/u.test(value) && !/[\p{Cc}\p{Cf}]/u.test(value);
  if (!valid) throw new CliError('请提供有效单资源ID或完整授权标识，可加 id: 或 name:；不能使用空白或其它选择器', 'COLLECTION_DEP_TARGET_INVALID');
  return { kind, value };
}

function assertWritable(target: Awaited<ReturnType<typeof resolveCollectionTarget>>): void {
  if (Number(target.info.status) === 2 || target.info.rssSource === 'yes' || (typeof target.info.feedUrl === 'string' && target.info.feedUrl.trim())) {
    throw new CliError('当前合集不可维护直接依赖', 'COLLECTION_DEP_COLLECTION_UNWRITABLE');
  }
}

async function targetFacts(source: Source, collectionId: string, apis: CollectionDepApis): Promise<{ id: string; latest: string }> {
  const get = apis.targetInfo ?? ((params) => FServiceAPI.Resource.info(params as never));
  const invalid = () => new CliError('无法可靠读取依赖目标的成功响应及精确身份；本地稿未修改', 'COLLECTION_DEP_TARGET_RESPONSE_INVALID');
  let response: unknown;
  try { response = await get({ resourceIdOrName: source.value, isLoadLatestVersionInfo: 1 }); } catch { throw invalid(); }
  if (!succeeded(response) || !record(response.data)) throw invalid();
  const info = response.data, id = info.resourceId;
  if (!validId(id) || (source.kind === 'id' ? id !== source.value : info.resourceName !== source.value)) throw invalid();
  const single = info.subjectType === 1 || (Array.isArray(info.subjectType) && info.subjectType.length === 1 && info.subjectType[0] === 1);
  if (id === collectionId || !single) throw new CliError('依赖目标必须是其他已发布单资源', 'COLLECTION_DEP_TARGET_INVALID');
  const latest = typeof info.latestVersion === 'string' ? info.latestVersion : '';
  if (!semver.valid(latest) || info.status !== 1) throw new CliError('依赖目标必须有已发布且可用的版本', 'COLLECTION_DEP_TARGET_UNAVAILABLE');
  return { id, latest };
}

async function assertRange(resourceId: string, latest: string, range: string, apis: CollectionDepApis): Promise<void> {
  if (!semver.validRange(range)) throw new CliError('依赖版本范围无效', 'COLLECTION_DEP_RANGE_INVALID');
  const getVersions = apis.getVersions ?? ((params) => FServiceAPI.Resource.getVersionListByResourceID(params as never));
  const invalid = () => new CliError('无法可靠读取依赖目标的完整已发布版本列表；本地稿未修改', 'COLLECTION_DEP_VERSIONS_RESPONSE_INVALID');
  let response: unknown;
  try { response = await getVersions({ resourceId }); } catch { throw invalid(); }
  if (!succeeded(response) || !Array.isArray(response.data)) throw invalid();
  const versions: string[] = [], seen = new Set<string>();
  for (const row of response.data) {
    if (!record(row) || row.resourceId !== resourceId || typeof row.version !== 'string' || !semver.valid(row.version) || seen.has(row.version)) throw invalid();
    seen.add(row.version); versions.push(row.version);
  }
  if (!versions.includes(latest) || !semver.maxSatisfying(versions, range)) throw new CliError('依赖范围没有命中目标已发布版本', 'COLLECTION_DEP_RANGE_INVALID');
}

/** 添加/改范围都走真实版本与循环校验；授权、签约和支付留给网页端处理。 */
export async function addCollectionDependency(input: {
  cwd: string; selector?: string; source: string; range?: string; homeDir?: string; apis?: CollectionDepApis;
}): Promise<{ resourceId: string; versionRange: string }> {
  assertPlatformAllowed();
  const source = parseSource(input.source);
  const target = await resolveCollectionTarget(input);
  assertWritable(target);
  const apis = input.apis ?? {};
  const fact = await targetFacts(source, target.resourceId, apis); const range = input.range ?? `^${fact.latest}`;
  await assertRange(fact.id, fact.latest, range, apis);
  const draft = readCollectionFormDraft(input.cwd, target.resourceId);
  if (!draft) throw new CliError('没有本地合集表单草稿，请先 collection form pull', 'COLLECTION_FORM_DRAFT_MISSING');
  const cycle = apis.cycleCheck ?? ((params) => FServiceAPI.Resource.cycleDependencyCheck(params as never));
  const invalid = () => new CliError('依赖环检测未返回可信结果；本地稿未修改，请核对后再试。', 'COLLECTION_DEP_CYCLE_RESPONSE_INVALID');
  let result: unknown;
  try {
    result = await cycle({ resourceId: target.resourceId, dependencies: [...draft.form.dependencies.filter((item) => item.resourceId !== fact.id), { resourceId: fact.id, versionRange: range }] });
  } catch {
    // 检测异常不能当成无环，也不输出原始请求诊断。
    throw invalid();
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || !('ret' in result) || result.ret !== 0 || !('errCode' in result) || result.errCode !== 0
    || !('data' in result) || typeof result.data !== 'boolean') throw invalid();
  if (!result.data) throw new CliError('添加此依赖会形成循环依赖', 'COLLECTION_DEP_CYCLE');
  mutateCollectionFormDraft(input.cwd, target.resourceId, (form) => ({ ...form, dependencies: [...form.dependencies.filter((item) => item.resourceId !== fact.id), { resourceId: fact.id, versionRange: range }] }));
  return { resourceId: fact.id, versionRange: range };
}

/** 从本地表单移除一条直接依赖；不会取消已签合同或发布。 */
export async function removeCollectionDependency(input: { cwd: string; selector?: string; resourceId: string; homeDir?: string; apis?: CollectionDepApis }): Promise<void> {
  assertPlatformAllowed();
  const target = await resolveCollectionTarget(input);
  assertWritable(target);
  const draft = readCollectionFormDraft(input.cwd, target.resourceId); if (!draft || !draft.form.dependencies.some((item) => item.resourceId === input.resourceId)) throw new CliError('本地表单中没有该依赖', 'COLLECTION_DEP_NOT_FOUND');
  mutateCollectionFormDraft(input.cwd, target.resourceId, (form) => ({ ...form, dependencies: form.dependencies.filter((item) => item.resourceId !== input.resourceId) }));
}

/** 列出当前本地表单的待发布直接依赖。 */
export async function listCollectionDependencies(input: { cwd: string; selector?: string; homeDir?: string; apis?: CollectionDepApis }): Promise<Array<{ resourceId: string; versionRange: string }>> {
  const target = await resolveCollectionTarget(input); const draft = readCollectionFormDraft(input.cwd, target.resourceId);
  if (!draft) throw new CliError('没有本地合集表单草稿，请先 collection form pull', 'COLLECTION_FORM_DRAFT_MISSING'); return draft.form.dependencies;
}
