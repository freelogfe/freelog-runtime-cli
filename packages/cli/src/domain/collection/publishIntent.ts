/** 一次合集发布的可恢复预期，不是版本档案；调用方持项目锁。 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { atomicWriteFile } from '../../core/atomicWrite';
import { CliError } from '../../core/errors';
import { freelogDir } from '../../local/identity';
import { clearUnchangedCollectionFormDraft, parseAuthExcludedItems, toCollectionUpdatePayload, validateForm, type AuthExcludedItem, type CollectionForm } from './form';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const stateSchema = z.enum(['prepared', 'sending', 'unknown', 'rejected']);
const schema = z.object({
  schemaVersion: z.literal(2), resourceId: z.string().min(1), resourceName: z.string().min(1), resourceTypeCode: z.string().min(1),
  env: z.enum(['test', 'dev']), userId: z.number().int().positive(), state: stateSchema,
  baselineFingerprint: hashSchema, baselineAuthFingerprint: hashSchema, baselineDirectoryFingerprint: hashSchema,
  expectedForm: z.unknown(), expectedAuthExcludedItems: z.unknown(), merge: z.union([z.literal(0), z.literal(1)]),
  directoryFingerprint: hashSchema, payloadSha256: hashSchema, sourceDraftSha256: hashSchema.nullable(), sentAt: z.string().datetime(),
  rejection: z.object({ ret: z.number().int().safe(), errCode: z.number().int().safe() }).strict().optional(),
}).strict().refine((value) => value.state === 'rejected'
  ? value.rejection !== undefined && (value.rejection.ret !== 0 || value.rejection.errCode !== 0)
  : value.rejection === undefined);

export type CollectionPublishIntent = Omit<z.infer<typeof schema>, 'expectedForm' | 'expectedAuthExcludedItems'> & { expectedForm: CollectionForm; expectedAuthExcludedItems: AuthExcludedItem[] };
export type IntentSnapshot = { file: string; sha256: string; intent: CollectionPublishIntent };
/** 对可序列化的发布快照取摘要，绑定本次预期而非猜测远端成功。 */
export function publishValueFingerprint(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
/** 定位该合集唯一的未决发布记录；环境和账号由记录内容另行校验。 */
export function collectionIntentPath(cwd: string, resourceId: string): string { return path.join(freelogDir(cwd), 'collection-forms', 'intents', `${encodeURIComponent(resourceId)}.json`); }

/** 已有记录时禁止覆盖或重发，先走只读核验或显式收尾。 */
export function assertNoCollectionIntent(cwd: string, resourceId: string): void {
  if (existsSync(collectionIntentPath(cwd, resourceId))) throw new CliError('合集有未决发布；请先 collection publish resume 核验，不能覆盖记录或重发', 'COLLECTION_PUBLISH_PENDING');
}

/** 严格读取并校验完整预期及载荷摘要；旧记录只供诊断，不补造恢复证据。 */
export function readCollectionIntent(cwd: string, resourceId: string): IntentSnapshot | { legacy: true; state: string } {
  const file = collectionIntentPath(cwd, resourceId);
  if (!existsSync(file)) throw new CliError('当前合集没有待核验的发布 intent', 'COLLECTION_PUBLISH_INTENT_MISSING');
  let raw: unknown;
  const bytes = readFileSync(file);
  try { raw = JSON.parse(bytes.toString('utf8')); } catch { throw new CliError('发布 intent 无法解析', 'COLLECTION_PUBLISH_INTENT_INVALID'); }
  if (raw && typeof raw === 'object' && 'schemaVersion' in raw && raw.schemaVersion === 1 && 'resourceId' in raw && raw.resourceId === resourceId) {
    const state = 'state' in raw ? stateSchema.safeParse(raw.state) : undefined;
    if (state?.success) return { legacy: true, state: state.data };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success || parsed.data.resourceId !== resourceId) throw new CliError('发布 intent 与当前合集不一致或字段无效', 'COLLECTION_PUBLISH_INTENT_INVALID');
  let expectedForm: CollectionForm;
  try { expectedForm = validateForm(parsed.data.expectedForm, true); } catch { throw new CliError('发布 intent 的预期表单无效', 'COLLECTION_PUBLISH_INTENT_INVALID'); }
  const auth = parseAuthExcludedItems(parsed.data.expectedAuthExcludedItems);
  if (!auth || publishValueFingerprint(toCollectionUpdatePayload(expectedForm, resourceId, auth, parsed.data.merge)) !== parsed.data.payloadSha256) {
    throw new CliError('发布 intent 的预期快照或摘要无效', 'COLLECTION_PUBLISH_INTENT_INVALID');
  }
  return { file, sha256: createHash('sha256').update(bytes).digest('hex'), intent: { ...parsed.data, expectedForm, expectedAuthExcludedItems: auth } };
}

/** 修改或清理前重核原始字节，拒绝认领已被替换的记录。 */
export function assertCollectionIntentUnchanged(snapshot: IntentSnapshot): void {
  if (!existsSync(snapshot.file) || createHash('sha256').update(readFileSync(snapshot.file)).digest('hex') !== snapshot.sha256) throw new CliError('发布 intent 已被修改，拒绝认领或清理', 'COLLECTION_PUBLISH_INTENT_CHANGED');
}

/** 持项目锁时保存首次记录或推进同一记录，并返回本次实际写入的独立快照。 */
export function saveCollectionIntent(cwd: string, intent: CollectionPublishIntent, previous?: IntentSnapshot): IntentSnapshot {
  if (previous) assertCollectionIntentUnchanged(previous);
  else assertNoCollectionIntent(cwd, intent.resourceId);
  const file = collectionIntentPath(cwd, intent.resourceId);
  const text = `${JSON.stringify(intent, null, 2)}\n`;
  atomicWriteFile(file, text);
  // 返回本次写出的字节副本，不重新读盘认领其它操作，也不与SDK payload共享引用。
  return { file, sha256: createHash('sha256').update(text).digest('hex'), intent: JSON.parse(text) as CollectionPublishIntent };
}

/** marker最后清：中断留着它，下一次只核验/收尾，不重发。 */
export function finishCollectionIntent(cwd: string, snapshot: IntentSnapshot): 'unchanged' | 'changed' | 'absent' {
  assertCollectionIntentUnchanged(snapshot);
  const local = clearUnchangedCollectionFormDraft(cwd, snapshot.intent.resourceId, snapshot.intent.sourceDraftSha256);
  assertCollectionIntentUnchanged(snapshot);
  unlinkSync(snapshot.file);
  return local;
}

/** 已核验明确拒绝及旧基线后，仅清同一记录，始终不触碰当前工作稿。 */
export function removeRejectedCollectionIntent(snapshot: IntentSnapshot): void {
  assertCollectionIntentUnchanged(snapshot);
  unlinkSync(snapshot.file);
}
