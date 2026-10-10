/** 合集一次性发布：完整本地表单快照 + 可选服务端目录草稿 merge。 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../../core/atomicWrite';
import { CliError } from '../../core/errors';
import { confirmWrite } from '../../core/tty';
import { freelogDir } from '../../local/identity';
import { withProjectLock } from '../../local/lock';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';
import { getCollectionCollectRules, type CollectionCollectRulesApis } from './collectRules';
import { collectionFormFingerprint, deleteCollectionFormDraft, readCollectionFormDraft, readPublishedCollectionForm, toCollectionUpdatePayload, type CollectionFormApis } from './form';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';

type ItemApis = {
  getPublishedItems?: (params: Record<string, unknown>) => Promise<unknown>;
  getDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
};
export type CollectionPublishApis = CollectionFormApis & CollectionTargetApis & CollectionCollectRulesApis & ItemApis & {
  updateCollection?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(value: unknown): unknown { return (value as { data?: unknown }).data ?? value; }

function itemList(value: unknown): Record<string, unknown>[] {
  const data = unwrapData(value);
  const list = Array.isArray(data) ? data : data && typeof data === 'object'
    ? ((data as { dataList?: unknown; list?: unknown; items?: unknown }).dataList ?? (data as { list?: unknown }).list ?? (data as { items?: unknown }).items)
    : undefined;
  if (!Array.isArray(list)) throw new CliError('平台目录响应格式无法识别', 'COLLECTION_ITEMS_RESPONSE_INVALID');
  return list.map((item) => {
    if (!item || typeof item !== 'object') throw new CliError('平台目录包含无效单品', 'COLLECTION_ITEMS_RESPONSE_INVALID');
    const raw = item as Record<string, unknown>;
    const mounted = raw.mountResourceInfo && typeof raw.mountResourceInfo === 'object' ? raw.mountResourceInfo as Record<string, unknown> : {};
    const itemId = String(raw.itemId ?? raw.id ?? ''); const resourceId = String(raw.resourceId ?? raw.resourceID ?? mounted.resourceId ?? mounted.resourceID ?? '');
    if (!itemId || !resourceId) throw new CliError('平台目录缺少单品身份', 'COLLECTION_ITEMS_RESPONSE_INVALID');
    return {
      itemId, resourceId, itemTitle: String(raw.itemTitle ?? ''), sortId: Number(raw.sortId ?? 0),
      authExcludedItems: Array.isArray(raw.authExcludedItems) ? raw.authExcludedItems : [],
    };
  });
}

async function readAllItems(resourceId: string, request: (params: Record<string, unknown>) => Promise<unknown>): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let skip = 0; ; skip += 100) {
    const page = itemList(await request({ resourceId, skip, limit: 100, sortField: 'sortId', sortType: 1 })); all.push(...page);
    if (page.length < 100) return all;
  }
}

function itemFingerprint(items: Record<string, unknown>[]): string {
  return createHash('sha256').update(JSON.stringify(items)).digest('hex');
}

function intentPath(cwd: string, resourceId: string): string {
  return path.join(freelogDir(cwd), 'collection-forms', 'intents', `${encodeURIComponent(resourceId)}.json`);
}

function writeIntent(cwd: string, resourceId: string, state: 'prepared' | 'sending' | 'unknown', payload: Record<string, unknown>, baselineFingerprint: string, directoryFingerprint: string): void {
  atomicWriteFile(intentPath(cwd, resourceId), `${JSON.stringify({ schemaVersion: 1, resourceId, state, baselineFingerprint, directoryFingerprint, payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), sentAt: new Date().toISOString() }, null, 2)}\n`);
}

/** 请求不确定后的只读诊断；绝不自动重发或删除本地稿。 */
export async function inspectCollectionPublishIntent(input: { cwd: string; selector?: string; homeDir?: string; apis?: CollectionPublishApis }): Promise<Record<string, unknown>> {
  const target = await resolveCollectionTarget(input);
  const file = intentPath(input.cwd, target.resourceId);
  if (!existsSync(file)) throw new CliError('当前合集没有待核验的发布 intent', 'COLLECTION_PUBLISH_INTENT_MISSING');
  let intent: unknown;
  try { intent = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new CliError('发布 intent 无法解析', 'COLLECTION_PUBLISH_INTENT_INVALID'); }
  if (!intent || typeof intent !== 'object' || (intent as Record<string, unknown>).resourceId !== target.resourceId) throw new CliError('发布 intent 与当前合集不一致', 'COLLECTION_PUBLISH_INTENT_INVALID');
  const remote = await readPublishedCollectionForm({ resourceId: target.resourceId, latestVersion: target.info.latestVersion, apis: input.apis });
  return { intent, remoteLatestVersion: target.info.latestVersion ?? null, remoteFormFingerprint: collectionFormFingerprint(remote.form), localDraftExists: Boolean(readCollectionFormDraft(input.cwd, target.resourceId)) };
}

function assertWritable(target: Awaited<ReturnType<typeof resolveCollectionTarget>>): void {
  if (Number(target.info.status) === 2) throw new CliError('冻结合集不能发布', 'COLLECTION_FROZEN');
  if (target.info.rssSource === 'yes' || (typeof target.info.feedUrl === 'string' && target.info.feedUrl.trim())) throw new CliError('RSS 合集当前不支持 CLI 发布', 'COLLECTION_RSS_READONLY');
}

/**
 * 发布本地表单稿，或在没有本地表单修改时仅合并服务端目录草稿；不会创建资源
 * 版本、不会上架，也不会读取浏览器草稿。后者以刚读取的已发布表单为只读基线，
 * 不能把“没有本地稿”变成要求用户无意义 pull 一次的前置条件。
 */
export async function publishCollection(input: {
  cwd: string; selector?: string; includeItems?: 'auto' | 'yes' | 'no'; yes?: boolean; homeDir?: string; apis?: CollectionPublishApis;
}): Promise<Record<string, unknown>> {
  assertPlatformAllowed();
  return withProjectLock(input.cwd, async () => {
    const target = await resolveCollectionTarget(input); assertWritable(target);
    const draft = readCollectionFormDraft(input.cwd, target.resourceId);
    const remote = await readPublishedCollectionForm({ resourceId: target.resourceId, latestVersion: target.info.latestVersion, apis: input.apis });
    if (draft) {
      if (draft.resourceTypeCode !== target.typeCode) throw new CliError('合集类型已变化，请重新 collection form pull', 'COLLECTION_FORM_BASELINE_CHANGED');
      if (collectionFormFingerprint(remote.form) !== draft.publishedBaselineFingerprint) {
        throw new CliError('线上已发布合集表单已变化，请重新 collection form pull 后人工合并', 'COLLECTION_FORM_BASELINE_CHANGED');
      }
      if (draft.authState !== 'known-empty' && JSON.stringify(remote.authExcludedItems) !== JSON.stringify(draft.authExcludedItems)) {
        throw new CliError('无法验证已有合集的授权排除映射，拒绝用空或猜测值发布', 'COLLECTION_AUTH_STATE_UNREADABLE');
      }
    } else if (target.info.latestVersion && remote.authExcludedItems === undefined) {
      // 仅目录发布仍是完整 updateCollection；已有映射未明确返回时不能用空数组覆盖。
      throw new CliError('平台未返回已有合集的授权排除映射，拒绝用空或猜测值发布', 'COLLECTION_AUTH_STATE_UNREADABLE');
    }
    const published = input.apis?.getPublishedItems ?? ((params) => FServiceAPI.Resource.getCollectionItems(params as never));
    const serverDraft = input.apis?.getDraftItems ?? ((params) => FServiceAPI.Resource.getCollectionItems_Draft(params as never));
    const [publishedItems, draftItems] = await Promise.all([readAllItems(target.resourceId, published), readAllItems(target.resourceId, serverDraft)]);
    const changed = itemFingerprint(publishedItems) !== itemFingerprint(draftItems);
    const rules = await getCollectionCollectRules({ cwd: input.cwd, selector: input.selector, homeDir: input.homeDir, apis: input.apis });
    const mode = input.includeItems ?? 'auto';
    if (rules.status === 1 && (mode === 'yes' || changed && mode === 'auto')) {
      throw new CliError('自动收录开启时不能手工合并目录草稿；请选 --include-items no 或先关闭自动收录', 'COLLECTION_AUTO_MERGE_FORBIDDEN');
    }
    if (mode === 'yes' && !changed) throw new CliError('目录草稿与已发布目录相同，无需 --include-items yes', 'COLLECTION_MERGE_NOT_NEEDED');
    const merge = mode === 'yes' || mode === 'auto' && changed;
    if (!draft && !merge) throw new CliError('没有本地表单修改，目录草稿也没有变更，无需发布', 'COLLECTION_PUBLISH_NOTHING_TO_DO');
    const form = draft?.form ?? remote.form;
    const authExcludedItems = draft?.authExcludedItems ?? remote.authExcludedItems ?? [];
    const baselineFingerprint = draft?.publishedBaselineFingerprint ?? collectionFormFingerprint(remote.form);
    const payload = toCollectionUpdatePayload(form, target.resourceId, authExcludedItems, merge ? 1 : 0);
    await confirmWrite(`发布合集变更\n目标：${target.resourceName}\n目录：${merge ? '合并服务端目录草稿' : '不合并目录'}\n属性：${form.properties.length}，配置：${form.options.length}，依赖：${form.dependencies.length}`, input.yes);
    const directoryFingerprint = itemFingerprint(draftItems);
    writeIntent(input.cwd, target.resourceId, 'prepared', payload, baselineFingerprint, directoryFingerprint);
    writeIntent(input.cwd, target.resourceId, 'sending', payload, baselineFingerprint, directoryFingerprint);
    const update = input.apis?.updateCollection ?? ((params) => FServiceAPI.Resource.updateCollection(params as never));
    try { await update(payload); } catch (error) { writeIntent(input.cwd, target.resourceId, 'unknown', payload, baselineFingerprint, directoryFingerprint); throw error; }
    // 只读回线上表单和已发布目录。读回不一致时保留 intent，绝不重发。
    const afterTarget = await resolveCollectionTarget(input);
    const after = await readPublishedCollectionForm({ resourceId: target.resourceId, latestVersion: afterTarget.info.latestVersion, apis: input.apis });
    const afterItems = await readAllItems(target.resourceId, published);
    if (JSON.stringify(after.form) !== JSON.stringify(form) || merge && itemFingerprint(afterItems) !== directoryFingerprint) {
      writeIntent(input.cwd, target.resourceId, 'unknown', payload, baselineFingerprint, directoryFingerprint);
      throw new CliError('发布后读回与预期不一致，已保留本地 intent；不会自动重发', 'COLLECTION_PUBLISH_VERIFY_FAILED');
    }
    const file = intentPath(input.cwd, target.resourceId); if (existsSync(file)) unlinkSync(file);
    deleteCollectionFormDraft(input.cwd, target.resourceId);
    return payload;
  }, 'collection-publish');
}
