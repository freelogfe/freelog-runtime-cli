/** 合集完整快照发布与只核验、不重发的中断恢复。 */
import { CliError } from '../../core/errors';
import { confirmWrite, isInteractive } from '../../core/tty';
import { readCollectionIdentity } from '../../local/identity';
import { withProjectLock } from '../../local/lock';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed, getEnv } from '../env';
import { getCollectionCollectRules, type CollectionCollectRulesApis } from './collectRules';
import { collectionCatalogueFingerprint, readCollectionCatalogue } from './catalogue';
import { collectionFormDraftSha256, collectionFormFingerprint, readCollectionFormDraftSnapshot, readPublishedCollectionForm, toCollectionUpdatePayload, validateForm, type CollectionFormApis } from './form';
import { getCollectionTypeInfo } from './typePick';
import { resolveCollectionTarget, type CollectionTargetApis, type ResolvedCollectionTarget } from './target';
import { assertCollectionIntentUnchanged, assertNoCollectionIntent, finishCollectionIntent, publishValueFingerprint, readCollectionIntent, removeRejectedCollectionIntent, saveCollectionIntent, type CollectionPublishIntent, type IntentSnapshot } from './publishIntent';
import { collectionPublishPreview } from './publishPreview';
import { assertCollectionSystemForm, initialCollectionInputs, loadCollectionSystemRules } from './systemAttributes';

export type CollectionPublishApis = CollectionFormApis & CollectionTargetApis & CollectionCollectRulesApis & {
  getPublishedItems?: (params: Record<string, unknown>) => Promise<unknown>;
  getDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  updateCollection?: (params: Record<string, unknown>) => Promise<unknown>;
};
type Input = { cwd: string; selector?: string; homeDir?: string; apis?: CollectionPublishApis };

function itemRequests(apis?: CollectionPublishApis) {
  return {
    published: apis?.getPublishedItems ?? ((params: Record<string, unknown>) => FServiceAPI.Resource.getCollectionItems(params as never)),
    draft: apis?.getDraftItems ?? ((params: Record<string, unknown>) => FServiceAPI.Resource.getCollectionItems_Draft(params as never)),
  };
}
function assertWritable(target: ResolvedCollectionTarget): void {
  if (target.info.status === 2) throw new CliError('冻结合集不能发布', 'COLLECTION_FROZEN');
  if (target.info.rssSource === 'yes' || (typeof target.info.feedUrl === 'string' && target.info.feedUrl.trim())) throw new CliError('RSS 合集当前不支持 CLI 发布', 'COLLECTION_RSS_READONLY');
}
function assertLocalTarget(cwd: string, target: ResolvedCollectionTarget): void {
  if (!target.local) return;
  const now = readCollectionIdentity(cwd, target.local.n);
  if (now.resourceId !== target.resourceId || now.resourceName !== target.resourceName || now.typeCode !== target.typeCode || (now.env ?? 'prod') !== getEnv()) throw new CliError('本地合集身份在发布期间改变，已停止', 'COLLECTION_IDENTITY_MISMATCH');
}
function draftState(cwd: string, resourceId: string, expected: string | null): 'unchanged' | 'changed' | 'absent' {
  const current = collectionFormDraftSha256(cwd, resourceId);
  return current === null ? 'absent' : current === expected ? 'unchanged' : 'changed';
}
function sameIntentTarget(intent: CollectionPublishIntent, target: ResolvedCollectionTarget, userId: number): void {
  if (intent.env !== getEnv() || intent.userId !== userId || intent.resourceId !== target.resourceId || intent.resourceName !== target.resourceName || intent.resourceTypeCode !== target.typeCode) throw new CliError('发布 intent 的环境、账号或合集身份不匹配', 'COLLECTION_PUBLISH_INTENT_INVALID');
}

/** 规范化表单、授权映射及两种完整目录；不使用可变标题或日志推断成功。 */
async function observe(input: Input) {
  const target = await resolveCollectionTarget(input);
  const remote = await readPublishedCollectionForm({ resourceId: target.resourceId, latestVersion: target.info.latestVersion, apis: input.apis });
  const api = itemRequests(input.apis);
  const published = await readCollectionCatalogue(target.resourceId, api.published);
  const draft = await readCollectionCatalogue(target.resourceId, api.draft);
  return { target, remote, published, draft, publishedFingerprint: collectionCatalogueFingerprint(published), draftFingerprint: collectionCatalogueFingerprint(draft) };
}
function matchesExpected(intent: CollectionPublishIntent, observed: Awaited<ReturnType<typeof observe>>): boolean {
  return Boolean(observed.target.info.latestVersion) && observed.remote.authExcludedItems !== undefined
    && publishValueFingerprint(toCollectionUpdatePayload(observed.remote.form, intent.resourceId, observed.remote.authExcludedItems, intent.merge)) === intent.payloadSha256
    && (intent.merge === 0 || observed.publishedFingerprint === intent.directoryFingerprint);
}
function matchesBaseline(intent: CollectionPublishIntent, observed: Awaited<ReturnType<typeof observe>>): boolean {
  return collectionFormFingerprint(observed.remote.form) === intent.baselineFingerprint
    && observed.remote.authExcludedItems !== undefined
    && publishValueFingerprint(observed.remote.authExcludedItems) === intent.baselineAuthFingerprint
    && observed.publishedFingerprint === intent.baselineDirectoryFingerprint;
}

/** tools-lib的业务异常保留result；仅取自身数据字段，不读message/cause或执行getter。 */
function sdkRejection(error: unknown): { ret: number; errCode: number } | undefined {
  try {
    if (!(error instanceof Error)) return undefined;
    const result: unknown = Object.getOwnPropertyDescriptor(error, 'result')?.value;
    if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
    const ret: unknown = Object.getOwnPropertyDescriptor(result, 'ret')?.value;
    const errCode: unknown = Object.getOwnPropertyDescriptor(result, 'errCode')?.value;
    if (typeof ret === 'number' && Number.isSafeInteger(ret) && typeof errCode === 'number' && Number.isSafeInteger(errCode)
      && (ret !== 0 || errCode !== 0)) return { ret, errCode };
  } catch { /* 不能读取的异常也不构成平台明确拒绝。 */ }
  return undefined;
}

/** 默认只读。apply仅精确确认后收尾，不删除后来改变的稿，不发送发布请求。 */
export async function inspectCollectionPublishIntent(input: Input & { apply?: boolean; yes?: boolean }): Promise<Record<string, unknown>> {
  assertPlatformAllowed();
  if (input.apply && !input.yes) throw new CliError('收尾必须明确提供 --apply --yes', 'COLLECTION_RECOVER_NEED_YES');
  const inspect = async () => {
    const target = await resolveCollectionTarget(input);
    const pinned = { ...input, selector: `id:${target.resourceId}` };
    const snapshot = readCollectionIntent(input.cwd, target.resourceId);
    if ('legacy' in snapshot) {
      if (input.apply) throw new CliError('旧发布记录缺少可验证快照，已保留，不能自动收尾', 'COLLECTION_PUBLISH_INTENT_LEGACY');
      return { schemaVersion: 1, resourceId: target.resourceId, env: getEnv(), intentState: snapshot.state, verification: 'legacy-unverifiable', localDraft: draftState(input.cwd, target.resourceId, null), applied: false };
    }
    const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
    sameIntentTarget(snapshot.intent, target, auth.userId);
    const observed = await observe(pinned);
    sameIntentTarget(snapshot.intent, observed.target, auth.userId);
    assertLocalTarget(input.cwd, target);
    assertCollectionIntentUnchanged(snapshot);
    const confirmed = snapshot.intent.state !== 'rejected' && matchesExpected(snapshot.intent, observed);
    const rejected = snapshot.intent.state === 'rejected' && matchesBaseline(snapshot.intent, observed);
    let local = draftState(input.cwd, target.resourceId, snapshot.intent.sourceDraftSha256);
    if (input.apply) {
      if (!confirmed && !rejected) throw new CliError('线上完整快照尚未确认；已保留发布记录和当前稿，不会重发', 'COLLECTION_RECOVER_UNCONFIRMED');
      try {
        if (rejected) removeRejectedCollectionIntent(snapshot);
        else local = finishCollectionIntent(input.cwd, snapshot);
      }
      catch (error) {
        if (error instanceof CliError) throw error;
        throw new CliError('本次结果已核验，但本地收尾未完成；请重新 collection publish resume 核验', 'COLLECTION_RECOVER_CLEANUP_FAILED');
      }
    }
    return { schemaVersion: 1, resourceId: target.resourceId, env: getEnv(), intentState: snapshot.intent.state, verification: confirmed ? 'confirmed' : rejected ? 'rejected' : 'unconfirmed', localDraft: local, applied: Boolean(input.apply) };
  };
  // 默认只读也不能触发共用写锁入口的遗留事务前滚。
  return input.apply ? withProjectLock(input.cwd, inspect, 'collection-publish-resume') : inspect();
}

/** 完整预检、确认、单次PUT、精确读回。已有未决记录永不被新请求覆盖。 */
export async function publishCollection(input: Input & { includeItems?: 'auto' | 'yes' | 'no'; yes?: boolean }): Promise<Record<string, unknown>> {
  assertPlatformAllowed();
  return withProjectLock(input.cwd, async () => {
    const target = await resolveCollectionTarget(input); assertWritable(target);
    const pinned = { ...input, selector: `id:${target.resourceId}` };
    assertNoCollectionIntent(input.cwd, target.resourceId);
    const source = readCollectionFormDraftSnapshot(input.cwd, target.resourceId);
    const draft = source.draft;
    const observed = await observe(pinned); assertWritable(observed.target);
    const remote = observed.remote;
    if (remote.authExcludedItems === undefined || draft && publishValueFingerprint(remote.authExcludedItems) !== publishValueFingerprint(draft.authExcludedItems)) throw new CliError('平台未明确返回与基线一致的授权排除映射，不能猜测或清空', 'COLLECTION_AUTH_STATE_UNREADABLE');
    if (draft && (draft.resourceTypeCode !== target.typeCode || collectionFormFingerprint(remote.form) !== draft.publishedBaselineFingerprint)) throw new CliError('线上已发布表单或类型已变化，请先核验并人工合并', 'COLLECTION_FORM_BASELINE_CHANGED');
    let form = draft?.form ?? remote.form;
    const type = await getCollectionTypeInfo(target.typeCode, input.apis ?? {});
    validateForm(form, true, type.resourceConfig?.supportOptionalConfig === 2);
    const systemRules = await loadCollectionSystemRules(type, input.apis);
    // 首次仅发行目录也有完整系统空值；线上空基线不随当前配置改写。
    if (!draft && observed.target.info.latestVersion === '') form = { ...form, inputs: initialCollectionInputs(systemRules) };
    assertCollectionSystemForm(form, systemRules);
    const changed = observed.publishedFingerprint !== observed.draftFingerprint;
    const rules = await getCollectionCollectRules(pinned);
    const mode = input.includeItems ?? 'auto';
    if (!['auto', 'yes', 'no'].includes(mode)) throw new CliError('--include-items 仅支持 auto、yes 或 no', 'COLLECTION_MERGE_MODE_INVALID');
    if (rules.status === 1 && (mode === 'yes' || changed && mode === 'auto')) throw new CliError('自动收录开启时不能手工合并目录草稿', 'COLLECTION_AUTO_MERGE_FORBIDDEN');
    if (mode === 'yes' && !changed) throw new CliError('目录草稿没有变化，无需 --include-items yes', 'COLLECTION_MERGE_NOT_NEEDED');
    const merge = mode === 'yes' || mode === 'auto' && changed;
    if (!draft && !merge) throw new CliError('没有本地表单修改或目录差异，无需发布', 'COLLECTION_PUBLISH_NOTHING_TO_DO');
    const payload = toCollectionUpdatePayload(form, target.resourceId, remote.authExcludedItems, merge ? 1 : 0);
    const preview = collectionPublishPreview({ env: getEnv(), resourceId: target.resourceId, resourceName: target.resourceName,
      baseline: remote.form, form, published: observed.published, draft: observed.draft, authExcludedItems: remote.authExcludedItems, merge });
    // --yes仅省略问句；非TTY保持现有输出协议，不污染脚本输出。
    if (input.yes && isInteractive()) console.error(preview);
    await confirmWrite(preview, input.yes);
    const finalRules = await getCollectionCollectRules(pinned);
    if (JSON.stringify(finalRules) !== JSON.stringify(rules)) throw new CliError('确认期间收录规则改变，未发请求', 'COLLECTION_FORM_BASELINE_CHANGED');
    const finalType = await getCollectionTypeInfo(target.typeCode, input.apis ?? {});
    validateForm(form, true, finalType.resourceConfig?.supportOptionalConfig === 2);
    assertCollectionSystemForm(form, await loadCollectionSystemRules(finalType, input.apis));
    const final = await observe(pinned);
    const finalTarget = final.target; assertWritable(finalTarget);
    assertLocalTarget(input.cwd, target);
    if (finalTarget.typeCode !== target.typeCode || finalTarget.resourceName !== target.resourceName
      || collectionFormFingerprint(final.remote.form) !== collectionFormFingerprint(remote.form)
      || final.remote.authExcludedItems === undefined || publishValueFingerprint(final.remote.authExcludedItems) !== publishValueFingerprint(remote.authExcludedItems)
      || final.publishedFingerprint !== observed.publishedFingerprint || (merge || mode === 'auto') && final.draftFingerprint !== observed.draftFingerprint) {
      throw new CliError('确认期间线上表单、身份或目录基线改变，未发请求', 'COLLECTION_FORM_BASELINE_CHANGED');
    }
    if (collectionFormDraftSha256(input.cwd, target.resourceId) !== source.sha256) throw new CliError('预检或确认期间当前稿已改变，未发请求', 'COLLECTION_FORM_CHANGED');
    const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
    if (auth.userId !== target.info.userId) throw new CliError('发布期间当前账号改变，未发请求', 'COLLECTION_NOT_OWNER');
    let snapshot: IntentSnapshot = saveCollectionIntent(input.cwd, {
      schemaVersion: 2, resourceId: target.resourceId, resourceName: target.resourceName, resourceTypeCode: target.typeCode,
      env: getEnv() as 'test' | 'dev', userId: auth.userId, state: 'prepared', baselineFingerprint: collectionFormFingerprint(remote.form),
      baselineAuthFingerprint: publishValueFingerprint(remote.authExcludedItems), baselineDirectoryFingerprint: observed.publishedFingerprint,
      expectedForm: form, expectedAuthExcludedItems: remote.authExcludedItems, merge: merge ? 1 : 0,
      directoryFingerprint: observed.draftFingerprint, payloadSha256: publishValueFingerprint(payload), sourceDraftSha256: source.sha256, sentAt: new Date().toISOString(),
    });
    snapshot = saveCollectionIntent(input.cwd, { ...snapshot.intent, state: 'sending' }, snapshot);
    const update = input.apis?.updateCollection ?? ((params: Record<string, unknown>) => FServiceAPI.Resource.updateCollection(params as never));
    let result: unknown;
    try { result = await update(payload); }
    catch (error) {
      const rejection = sdkRejection(error);
      if (rejection) result = rejection;
      else {
        saveCollectionIntent(input.cwd, { ...snapshot.intent, state: 'unknown' }, snapshot);
        throw new CliError('合集发布结果未知；请 collection publish resume 核验，不要重发', 'COLLECTION_PUBLISH_RESULT_UNKNOWN');
      }
    }
    const envelope = result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : undefined;
    const succeeded = envelope?.ret === 0 && envelope.errCode === 0;
    let after: Awaited<ReturnType<typeof observe>>;
    try { after = await observe(pinned); }
    catch {
      saveCollectionIntent(input.cwd, { ...snapshot.intent, state: 'unknown' }, snapshot);
      throw new CliError('发布后完整读回失败；已保留记录和当前稿', 'COLLECTION_PUBLISH_VERIFY_FAILED');
    }
    sameIntentTarget(snapshot.intent, after.target, auth.userId);
    assertLocalTarget(input.cwd, target);
    if (!succeeded || !matchesExpected(snapshot.intent, after)) {
      // 明确业务拒绝且完整旧基线仍相同才解除占用；未知响应不是拒绝证明。
      const rejected = Number.isSafeInteger(envelope?.ret) && Number.isSafeInteger(envelope?.errCode) && !succeeded;
      if (rejected && matchesBaseline(snapshot.intent, after)) {
        snapshot = saveCollectionIntent(input.cwd, { ...snapshot.intent, state: 'rejected', rejection: { ret: envelope!.ret as number, errCode: envelope!.errCode as number } }, snapshot);
        try { removeRejectedCollectionIntent(snapshot); }
        catch (error) {
          if (error instanceof CliError) throw error;
          throw new CliError('平台已明确拒绝且旧快照未变，但本地记录清理失败；请 collection publish resume 核验', 'COLLECTION_PUBLISH_REJECTED_CLEANUP_FAILED');
        }
        throw new CliError('平台明确拒绝本次发布，旧基线未变；当前稿已保留', 'COLLECTION_PUBLISH_REJECTED');
      }
      saveCollectionIntent(input.cwd, { ...snapshot.intent, state: 'unknown' }, snapshot);
      throw new CliError('发布结果未精确确认；已保留记录和当前稿，不会重发', 'COLLECTION_PUBLISH_VERIFY_FAILED');
    }
    let local: 'unchanged' | 'changed' | 'absent';
    try { local = finishCollectionIntent(input.cwd, snapshot); }
    catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError('线上已确认发布，但本地收尾未完成；请 collection publish resume 核验，不要重发', 'COLLECTION_PUBLISH_CLEANUP_FAILED');
    }
    if (local === 'changed') console.warn('合集已确认发布；当前稿在发送后有修改，已完整保留。');
    return payload;
  }, 'collection-publish');
}
