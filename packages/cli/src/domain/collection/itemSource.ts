/** 合集单品的来源详情读契约；不能把缺失上游或宽松强转当成写入资格。 */
import { CliError } from '../../core/errors';

type SourceSelector = { kind: 'id' | 'name'; value: string };
// 裸点段会被URL标准化为父路径，不是可请求的资源身份。
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_.-]+$/.test(value) && value !== '.' && value !== '..';
const validName = (value: unknown): value is string => typeof value === 'string'
  && /^[^\s/:]+\/[^\s/:]+$/u.test(value) && !/[\p{Cc}\p{Cf}]/u.test(value);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** 所有来源输入先校验完，再读取任何远端详情，空前缀不得变成无操作成功。 */
export function parseCollectionItemSources(sources: readonly string[]): SourceSelector[] {
  const selectors: SourceSelector[] = [], seen = new Set<string>();
  for (const source of sources) {
    const kind = source.startsWith('name:') || (!source.includes(':') && source.includes('/')) ? 'name' : 'id';
    const value = source.replace(/^(id:|name:)/, '');
    if (!(kind === 'id' ? validId(value) : validName(value))) {
      throw new CliError('单品来源请使用有效ID或完整授权标识，可加 id: 或 name:；不能使用标题、空串或控制符。', 'COLLECTION_ITEM_SOURCE_INVALID');
    }
    const key = `${kind}:${value}`;
    if (!seen.has(key)) { selectors.push({ kind, value }); seen.add(key); }
  }
  return selectors;
}

/** 只输出固定业务诊断；异常或失败响应不能当作不存在/无上游，更不能泄露HTTP原文。 */
export function collectionItemSourceResponseInvalid(): CliError {
  return new CliError('平台单品来源详情的成功信封、精确身份或必要字段无效，未提交添加；请先核对资源详情。', 'COLLECTION_ITEM_SOURCE_RESPONSE_INVALID');
}

/** ID/name精确对应、实际标量资格字段、显式完整上游数组，均在合同/确认前核验。 */
export function parseCollectionItemSource(response: unknown, selector: SourceSelector, userId: number): {
  resourceId: string; title: string; upcasts: string[];
} {
  if (!record(response) || response.ret !== 0 || response.errCode !== 0 || !record(response.data)) throw collectionItemSourceResponseInvalid();
  const remote = response.data;
  if (!validId(remote.resourceId) || !validName(remote.resourceName) || typeof remote.resourceTitle !== 'string'
    || typeof remote.userId !== 'number' || !Number.isSafeInteger(remote.userId) || remote.userId <= 0
    || typeof remote.subjectType !== 'number' || !Number.isSafeInteger(remote.subjectType)
    || typeof remote.status !== 'number' || !Number.isSafeInteger(remote.status)
    || typeof remote.latestVersion !== 'string' || !Array.isArray(remote.baseUpcastResources)
    || (selector.kind === 'id' ? remote.resourceId !== selector.value : remote.resourceName !== selector.value)) {
    throw collectionItemSourceResponseInvalid();
  }
  const upcasts = new Set<string>();
  for (const upstream of remote.baseUpcastResources) {
    if (!record(upstream) || !validId(upstream.resourceId)) throw collectionItemSourceResponseInvalid();
    upcasts.add(upstream.resourceId);
  }
  if (remote.userId !== userId || remote.subjectType !== 1 || remote.status !== 1 || !remote.latestVersion.trim()) {
    throw new CliError('单品必须是当前账号已上架且已有版本的单资源，未提交添加。', 'COLLECTION_ITEM_SOURCE_INVALID');
  }
  return { resourceId: remote.resourceId, title: remote.resourceTitle, upcasts: [...upcasts] };
}
