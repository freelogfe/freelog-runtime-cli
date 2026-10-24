/** 合集本地表单操作稿。它从已发布快照建立，永不读取或写入 Console 服务端草稿。 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { atomicWriteFile } from '../../core/atomicWrite';
import { CliError } from '../../core/errors';
import { confirmWrite } from '../../core/tty';
import { freelogDir } from '../../local/identity';
import { withProjectLock } from '../../local/lock';
import { normalizeProjectPath, resolveExistingProjectPath } from '../../local/projectPath';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed, getEnv } from '../env';
import { getCollectionTypeInfo, type CollectionTypeApis } from './typePick';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';
import { assertCollectionSystemForm, initialCollectionInputs, loadCollectionSystemRules, type CollectionSystemApis } from './systemAttributes';

const formSchema = z.object({
  $schema: z.literal('freelog-cli.collection-form.v1'),
  inputs: z.array(z.object({ key: z.string(), value: z.string() }).strict()),
  properties: z.array(z.object({ key: z.string(), name: z.string(), value: z.string(), description: z.string() }).strict()),
  options: z.array(z.object({ key: z.string(), name: z.string(), kind: z.enum(['input', 'select']), value: z.string().optional(), values: z.array(z.string()).optional(), description: z.string() }).strict()),
  description: z.string(),
  display: z.object({
    sort: z.enum(['ascending', 'descending']),
    title: z.enum(['resource-title', 'serial-number', 'custom', 'hidden']),
    number: z.boolean(), image: z.boolean(), description: z.boolean(), view: z.enum(['list', 'card']),
  }).strict(),
  dependencies: z.array(z.object({ resourceId: z.string(), versionRange: z.string() }).strict()),
}).strict();

export type CollectionForm = z.infer<typeof formSchema>;
export type AuthExcludedItem = { resourceId: string; excludedType: 'contractId' | 'policyId'; excludedValue: string };
type FormDraft = {
  schemaVersion: 1;
  resourceId: string;
  resourceTypeCode: string;
  env: string;
  publishedBaselineFingerprint: string;
  baseline: CollectionForm;
  form: CollectionForm;
  authExcludedItems: AuthExcludedItem[];
  authState: 'known-empty' | 'unknown';
  createdAt: string;
  updatedAt: string;
};

const draftSchema: z.ZodType<FormDraft> = z.object({
  schemaVersion: z.literal(1), resourceId: z.string().min(1), resourceTypeCode: z.string().min(1), env: z.string().min(1),
  publishedBaselineFingerprint: z.string().length(64), baseline: formSchema, form: formSchema,
  authExcludedItems: z.array(z.object({ resourceId: z.string(), excludedType: z.enum(['contractId', 'policyId']), excludedValue: z.string() }).strict()),
  authState: z.enum(['known-empty', 'unknown']), createdAt: z.string().min(1), updatedAt: z.string().min(1),
}).strict();

export type CollectionFormApis = CollectionTargetApis & CollectionTypeApis & CollectionSystemApis & {
  versionInfo?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || !('ret' in result) || result.ret !== 0 || !('errCode' in result) || result.errCode !== 0
    || !('data' in result)) throw new CliError('平台合集表单不是成功响应', 'COLLECTION_FORM_RESPONSE_INVALID');
  const data = result.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CliError('平台合集表单响应格式无法识别', 'COLLECTION_FORM_RESPONSE_INVALID');
  return data as Record<string, unknown>;
}

/** 对规范化表单生成发布前冲突检测用 SHA-256 指纹。 */
export function collectionFormFingerprint(value: CollectionForm): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** 定位当前合集工作稿；该文件不承载历史版本管理。 */
export function collectionFormDraftPath(cwd: string, resourceId: string): string {
  return path.join(freelogDir(cwd), 'collection-forms', getEnv(), `${encodeURIComponent(resourceId)}.json`);
}

const draftPath = collectionFormDraftPath;

function defaultDisplay(): CollectionForm['display'] {
  return { sort: 'ascending', title: 'resource-title', number: true, image: true, description: true, view: 'list' };
}

function emptyForm(): CollectionForm {
  return { $schema: 'freelog-cli.collection-form.v1', inputs: [], properties: [], options: [], description: '', display: defaultDisplay(), dependencies: [] };
}

function normalizeDisplay(raw: unknown): CollectionForm['display'] {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const allowed: Record<string, string[]> = {
    collection_sort_list: ['collection_sort_ascending', 'collection_sort_descending'],
    collection_item_title: ['collection_item_title_rtitle', 'collection_item_title_sn', 'collection_item_title_custom', 'collection_item_title_empty'],
    collection_item_no_display: ['collection_item_no_display_show', 'collection_item_no_display_hide'],
    collection_item_image_display: ['collection_item_image_display_show', 'collection_item_image_display_hide'],
    collection_item_descr_display: ['collection_item_descr_display_show', 'collection_item_descr_display_hide'],
    collection_view: ['collection_view_list', 'collection_view_card'],
  };
  for (const [key, values] of Object.entries(allowed)) {
    if (key in value && (typeof value[key] !== 'string' || !values.includes(value[key] as string))) throw new CliError('已发布合集含未知展示设置，不能无损恢复', 'COLLECTION_FORM_RESPONSE_INVALID');
  }
  const sort = value.collection_sort_list === 'collection_sort_descending' ? 'descending' : 'ascending';
  const titleMap: Record<string, CollectionForm['display']['title']> = {
    collection_item_title_rtitle: 'resource-title', collection_item_title_sn: 'serial-number', collection_item_title_custom: 'custom', collection_item_title_empty: 'hidden',
  };
  return {
    sort,
    title: titleMap[String(value.collection_item_title)] ?? 'resource-title',
    number: value.collection_item_no_display !== 'collection_item_no_display_hide',
    image: value.collection_item_image_display !== 'collection_item_image_display_hide',
    description: value.collection_item_descr_display !== 'collection_item_descr_display_hide',
    view: value.collection_view === 'collection_view_card' ? 'card' : 'list',
  };
}

function fromPublished(raw: Record<string, unknown>): CollectionForm {
  if (!Array.isArray(raw.customPropertyDescriptors) || !Array.isArray(raw.systemPropertyDescriptors) || !Array.isArray(raw.dependencies)
    || typeof raw.description !== 'string' || !raw.catalogueProperty || typeof raw.catalogueProperty !== 'object' || Array.isArray(raw.catalogueProperty)) {
    throw new CliError('已发布合集表单字段不完整，拒绝补空覆盖', 'COLLECTION_FORM_RESPONSE_INVALID');
  }
  const descriptors = raw.customPropertyDescriptors;
  const properties: CollectionForm['properties'] = [];
  const options: CollectionForm['options'] = [];
  for (const descriptor of descriptors) {
    if (!descriptor || typeof descriptor !== 'object') throw new CliError('已发布表单含无效属性描述符', 'COLLECTION_FORM_UNKNOWN_DESCRIPTOR');
    const item = descriptor as Record<string, unknown>;
    const key = item.key; const name = item.name; const description = item.remark ?? '';
    if (typeof key !== 'string' || !key || typeof name !== 'string' || !name || typeof description !== 'string' || typeof item.defaultValue !== 'string') throw new CliError('已发布表单含不完整属性描述符', 'COLLECTION_FORM_UNKNOWN_DESCRIPTOR');
    if (item.type === 'readonlyText') properties.push({ key, name, value: item.defaultValue, description });
    else if (item.type === 'editableText') options.push({ key, name, kind: 'input', value: item.defaultValue, description });
    else if (item.type === 'select' && Array.isArray(item.candidateItems) && item.candidateItems.every((value) => typeof value === 'string')) {
      if (item.defaultValue !== item.candidateItems[0]) throw new CliError('下拉配置默认值不在候选首项，不能无损恢复', 'COLLECTION_FORM_UNKNOWN_DESCRIPTOR');
      options.push({ key, name, kind: 'select', values: item.candidateItems, description });
    } else throw new CliError(`已发布表单包含当前协议不支持的描述符类型 ${String(item.type)}`, 'COLLECTION_FORM_UNKNOWN_DESCRIPTOR');
  }
  const inputs: CollectionForm['inputs'] = [];
  for (const item of raw.systemPropertyDescriptors) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new CliError('系统属性描述符无效', 'COLLECTION_FORM_RESPONSE_INVALID');
    const field = item as Record<string, unknown>;
    if (field.insertMode === 2) {
      if (typeof field.key !== 'string' || typeof field.valueDisplay !== 'string') throw new CliError('系统附加值字段无效', 'COLLECTION_FORM_RESPONSE_INVALID');
      inputs.push({ key: field.key, value: field.valueDisplay });
    } else if (field.insertMode !== 1) throw new CliError('系统属性来源无效', 'COLLECTION_FORM_RESPONSE_INVALID');
  }
  const dependencies = raw.dependencies.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.resourceId !== 'string' || typeof item.versionRange !== 'string') throw new CliError('依赖读取字段无效', 'COLLECTION_FORM_RESPONSE_INVALID');
    return { resourceId: item.resourceId, versionRange: item.versionRange };
  });
  return validateForm({
    $schema: 'freelog-cli.collection-form.v1', inputs, properties, options, description: raw.description,
    display: normalizeDisplay(raw.catalogueProperty),
    dependencies,
  }, true);
}

/** 校验授权排除映射；无法证明格式有效时返回未知，不补造空映射。 */
export function parseAuthExcludedItems(value: unknown): AuthExcludedItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: AuthExcludedItem[] = [];
  const identifier = (raw: unknown): raw is string => typeof raw === 'string' && raw.length > 0 && !/[\s\p{Cc}\p{Cf}]/u.test(raw);
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
    const raw = item as Record<string, unknown>;
    if (!identifier(raw.resourceId) || (raw.excludedType !== 'contractId' && raw.excludedType !== 'policyId') || !identifier(raw.excludedValue)) return undefined;
    result.push({ resourceId: raw.resourceId, excludedType: raw.excludedType, excludedValue: raw.excludedValue });
  }
  return result;
}

function assertKey(key: string): void {
  if (!/^[a-zA-Z]([a-zA-Z0-9_]{1,29})?$/.test(key)) throw new CliError('属性 key 必须为 2-30 位字母开头的字母、数字或下划线', 'COLLECTION_FORM_KEY_INVALID');
}

/** 外部 JSON 与发布前共用校验；strict schema 先拒绝未知顶层字段。 */
export function validateForm(value: unknown, allowEmptyInputs = false, supportsOptions = true): CollectionForm {
  const parsed = formSchema.safeParse(value);
  if (!parsed.success) throw new CliError('合集表单 JSON 不符合 freelog-cli.collection-form.v1', 'COLLECTION_FORM_INVALID');
  const form = parsed.data;
  if (form.properties.length > 30 || form.options.length > 30) throw new CliError('属性和可选配置各最多30项', 'COLLECTION_FORM_TOO_MANY');
  if (!supportsOptions && form.options.length > 0) throw new CliError('当前合集类型不支持可选配置', 'COLLECTION_FORM_OPTIONS_UNSUPPORTED');
  const keys = new Set<string>(); const names = new Set<string>();
  for (const input of form.inputs) {
    if (!input.key) throw new CliError('系统属性 key 不能为空；值范围由当前系统配置决定', 'COLLECTION_FORM_INPUT_INVALID');
    if (keys.has(input.key)) throw new CliError('属性和配置 key 不能重复', 'COLLECTION_FORM_KEY_DUPLICATE'); keys.add(input.key);
  }
  for (const entry of [...form.properties, ...form.options]) {
    assertKey(entry.key);
    if (!entry.name || entry.name.length > 50 || entry.description.length > 50 || keys.has(entry.key) || names.has(entry.name)) {
      throw new CliError('属性/配置名称、说明、key 不符合长度或重复约束', 'COLLECTION_FORM_FIELD_INVALID');
    }
    keys.add(entry.key); names.add(entry.name);
    if ('value' in entry && entry.value !== undefined && entry.value.length > 140) throw new CliError('属性/文本配置值不能超过140字符', 'COLLECTION_FORM_VALUE_LONG');
    if ('kind' in entry && entry.kind === 'input' && (entry.value === undefined || entry.values !== undefined)) throw new CliError('input 配置必须给 value，不能附带 values', 'COLLECTION_FORM_OPTION_INVALID');
    if ('kind' in entry && entry.kind === 'select') {
      const values = entry.values;
      if (entry.value !== undefined || !values || values.length === 0 || values.length > 30 || values.some((item) => !item || item.length > 140) || new Set(values).size !== values.length) {
        throw new CliError('select 配置必须有 1-30 个不重复且不超过140字符的候选值', 'COLLECTION_FORM_OPTION_INVALID');
      }
    }
  }
  if (form.dependencies.some((item) => !item.resourceId || !item.versionRange) || new Set(form.dependencies.map((item) => item.resourceId)).size !== form.dependencies.length) {
    throw new CliError('依赖必须有 resourceId、versionRange 且不能重复', 'COLLECTION_FORM_DEP_INVALID');
  }
  if (!allowEmptyInputs && form.inputs.some((item) => !item.key)) throw new CliError('系统属性不能为空', 'COLLECTION_FORM_INPUT_INVALID');
  return form;
}

function writeDraft(cwd: string, draft: FormDraft): FormDraft {
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) throw new CliError('合集本地表单草稿无效', 'COLLECTION_FORM_DRAFT_INVALID');
  atomicWriteFile(draftPath(cwd, draft.resourceId), `${JSON.stringify(parsed.data, null, 2)}\n`);
  return parsed.data;
}

/** 读取与当前环境、合集 immutable ID 严格匹配的本地操作稿。 */
export function readCollectionFormDraft(cwd: string, resourceId: string): FormDraft | undefined {
  return readCollectionFormDraftSnapshot(cwd, resourceId).draft;
}

/** 摘要与解析共享一次读盘，不能在异步预检后认领后来写入的稿。 */
export function readCollectionFormDraftSnapshot(cwd: string, resourceId: string): { draft?: FormDraft; sha256: string | null } {
  const source = draftPath(cwd, resourceId);
  if (!existsSync(source)) return { sha256: null };
  let raw: unknown;
  let bytes: Buffer;
  try { bytes = readFileSync(source); raw = JSON.parse(bytes.toString('utf8')); } catch { throw new CliError('合集本地表单草稿无法解析', 'COLLECTION_FORM_DRAFT_INVALID'); }
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success || parsed.data.resourceId !== resourceId || parsed.data.env !== getEnv()) throw new CliError('合集本地表单草稿与当前目标或环境不一致', 'COLLECTION_FORM_DRAFT_INVALID');
  if (collectionFormFingerprint(parsed.data.baseline) !== parsed.data.publishedBaselineFingerprint) throw new CliError('合集操作稿基线摘要不一致', 'COLLECTION_FORM_DRAFT_INVALID');
  return { draft: parsed.data, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** 不解析后来可能尚未写完的JSON；它不是本次发送稿就必须保留。 */
export function collectionFormDraftSha256(cwd: string, resourceId: string): string | null {
  const file = draftPath(cwd, resourceId);
  return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null;
}

/** 仅删除与发送时字节摘要相同的稿；后来变稿或无法证明未变的稿完整保留。 */
export function clearUnchangedCollectionFormDraft(cwd: string, resourceId: string, expected: string | null): 'unchanged' | 'changed' | 'absent' {
  const current = collectionFormDraftSha256(cwd, resourceId);
  if (current === null) return 'absent';
  if (current !== expected) return 'changed';
  unlinkSync(draftPath(cwd, resourceId));
  return 'unchanged';
}

/** 在已存在的本地表单操作稿上原子修改完整表单；供 dep 等同一表单域命令复用。 */
export function mutateCollectionFormDraft(cwd: string, resourceId: string, mutate: (form: CollectionForm) => CollectionForm): CollectionForm {
  return withProjectLock(cwd, () => {
    const draft = readCollectionFormDraft(cwd, resourceId);
    if (!draft) throw new CliError('没有本地合集表单草稿，请先 collection form pull', 'COLLECTION_FORM_DRAFT_MISSING');
    const form = validateForm(mutate(draft.form), true);
    writeDraft(cwd, { ...draft, form, updatedAt: new Date().toISOString() });
    return form;
  }, 'collection-form-mutate');
}

/** 只有 publish 读回确认后才能清除本地操作稿；不存在视为已清理。 */
export function deleteCollectionFormDraft(cwd: string, resourceId: string): boolean {
  return withProjectLock(cwd, () => {
    const source = draftPath(cwd, resourceId);
    if (!existsSync(source)) return false;
    unlinkSync(source);
    return true;
  }, 'collection-form-delete');
}

/** 只读当前已发布基线；不创建/覆盖本地操作稿，也不触碰服务端草稿。 */
export async function readPublishedCollectionForm(input: {
  resourceId: string;
  latestVersion?: unknown;
  apis?: CollectionFormApis;
}): Promise<{ form: CollectionForm; authExcludedItems?: AuthExcludedItem[] }> {
  if (typeof input.latestVersion !== 'string') throw new CliError('合集最新快照字段缺失或无效', 'COLLECTION_FORM_RESPONSE_INVALID');
  const latest = input.latestVersion;
  if (latest === '') {
    // 尚无发布版本是稳定事实；当前字段仅补到工作稿，不能改变恢复用基线。
    return { form: emptyForm(), authExcludedItems: [] };
  }
  if (!latest.trim()) throw new CliError('合集最新快照字段无效', 'COLLECTION_FORM_RESPONSE_INVALID');
  const versionInfo = input.apis?.versionInfo ?? ((params) => FServiceAPI.Resource.resourceVersionInfo1(params as never));
  const version = unwrapData(await versionInfo({ resourceId: input.resourceId, version: latest }));
  if (version.resourceId !== input.resourceId || version.version !== latest) throw new CliError('已发布合集快照身份或版本不匹配', 'COLLECTION_FORM_RESPONSE_INVALID');
  return { form: fromPublished(version), ...(parseAuthExcludedItems(version.authExcludedItems) ? { authExcludedItems: parseAuthExcludedItems(version.authExcludedItems) } : {}) };
}

function supportsOptions(type: { resourceConfig?: { supportOptionalConfig?: number | string } }): boolean {
  return type.resourceConfig?.supportOptionalConfig === 2;
}

function writable(target: Awaited<ReturnType<typeof resolveCollectionTarget>>): void {
  if (Number(target.info.status) === 2) throw new CliError('冻结合集不能修改表单', 'COLLECTION_FROZEN');
  if (target.info.rssSource === 'yes' || (typeof target.info.feedUrl === 'string' && target.info.feedUrl.trim())) throw new CliError('RSS 合集当前不支持 CLI 表单维护', 'COLLECTION_RSS_READONLY');
}

/** 从唯一可信的已发布快照初始化/刷新本地操作稿，不接触 Console 草稿。 */
export async function pullCollectionForm(input: { cwd: string; selector?: string; yes?: boolean; homeDir?: string; apis?: CollectionFormApis }): Promise<CollectionForm> {
  assertPlatformAllowed();
  const target = await resolveCollectionTarget(input); writable(target);
  const apis = input.apis ?? {};
  const type = await getCollectionTypeInfo(target.typeCode, apis);
  const rules = await loadCollectionSystemRules(type, apis);
  const published = await readPublishedCollectionForm({ resourceId: target.resourceId, latestVersion: target.info.latestVersion, apis });
  const authState: FormDraft['authState'] = published.authExcludedItems === undefined ? 'unknown' : 'known-empty';
  const authExcludedItems = published.authExcludedItems ?? [];
  const baseline = validateForm(published.form, true, supportsOptions(type));
  // 历史基线保持原始事实；只在待编辑稿中为当前新字段补显式空值，不删旧字段。
  const inputKeys = new Set(baseline.inputs.map((item) => item.key));
  const form = { ...baseline, inputs: [...baseline.inputs, ...initialCollectionInputs(rules).filter((item) => !inputKeys.has(item.key))] };
  const now = new Date().toISOString();
  const existing = readCollectionFormDraft(input.cwd, target.resourceId);
  if (existing) await confirmWrite(`刷新合集本地表单操作稿\n目标：${target.resourceName}\n这会覆盖未发布的本地表单修改。`, input.yes);
  withProjectLock(input.cwd, () => writeDraft(input.cwd, {
    schemaVersion: 1, resourceId: target.resourceId, resourceTypeCode: target.typeCode, env: getEnv(),
    publishedBaselineFingerprint: collectionFormFingerprint(baseline), baseline, form, authExcludedItems, authState, createdAt: now, updatedAt: now,
  }), 'collection-form-pull');
  return form;
}

function readExternalForm(cwd: string, source: string): unknown {
  const normalized = normalizeProjectPath(cwd, source, { code: 'COLLECTION_FORM_OUTSIDE', message: '表单文件必须位于当前工程内' });
  const resolved = resolveExistingProjectPath(cwd, path.resolve(cwd, normalized), { code: 'COLLECTION_FORM_OUTSIDE', message: '表单文件必须位于当前工程内' });
  try { return JSON.parse(readFileSync(resolved, 'utf8')); } catch { throw new CliError('表单文件必须是有效 JSON', 'COLLECTION_FORM_INVALID'); }
}

/** 用完整外部 JSON 覆盖本地操作稿；不会触发 updateCollection。 */
export async function editCollectionForm(input: { cwd: string; selector?: string; from: string; homeDir?: string; apis?: CollectionFormApis }): Promise<CollectionForm> {
  const target = await resolveCollectionTarget(input); writable(target);
  const type = await getCollectionTypeInfo(target.typeCode, input.apis ?? {});
  const form = validateForm(readExternalForm(input.cwd, input.from), true, supportsOptions(type));
  assertCollectionSystemForm(form, await loadCollectionSystemRules(type, input.apis));
  return withProjectLock(input.cwd, () => {
    const draft = readCollectionFormDraft(input.cwd, target.resourceId);
    if (!draft) throw new CliError('没有本地合集表单草稿，请先 collection form pull', 'COLLECTION_FORM_DRAFT_MISSING');
    writeDraft(input.cwd, { ...draft, form, updatedAt: new Date().toISOString() });
    return form;
  }, 'collection-form-edit');
}

/** 查看本地待发布表单；不可用本地标题或浏览器草稿猜测目标。 */
export async function showCollectionForm(input: { cwd: string; selector?: string; homeDir?: string; apis?: CollectionFormApis }): Promise<CollectionForm> {
  const target = await resolveCollectionTarget(input);
  const draft = readCollectionFormDraft(input.cwd, target.resourceId);
  if (!draft) throw new CliError('没有本地合集表单草稿，请先 collection form pull', 'COLLECTION_FORM_DRAFT_MISSING');
  return draft.form;
}

/** 展示配置的参数化便捷入口；与 form edit 一样只写本地操作稿。 */
export async function setCollectionDisplay(input: {
  cwd: string; selector?: string; sort?: 'ascending' | 'descending'; title?: 'resource-title' | 'serial-number' | 'custom' | 'hidden';
  number?: boolean; image?: boolean; description?: boolean; view?: 'list' | 'card'; homeDir?: string; apis?: CollectionFormApis;
}): Promise<CollectionForm> {
  if (input.sort === undefined && input.title === undefined && input.number === undefined && input.image === undefined && input.description === undefined && input.view === undefined) {
    throw new CliError('至少提供一个 display 修改项', 'COLLECTION_DISPLAY_EMPTY');
  }
  const target = await resolveCollectionTarget(input); writable(target);
  return mutateCollectionFormDraft(input.cwd, target.resourceId, (form) => ({
    ...form,
    display: { ...form.display, ...(input.sort === undefined ? {} : { sort: input.sort }), ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.number === undefined ? {} : { number: input.number }), ...(input.image === undefined ? {} : { image: input.image }),
      ...(input.description === undefined ? {} : { description: input.description }), ...(input.view === undefined ? {} : { view: input.view }) },
  }));
}

/** 输出表单到用户显式指定的工程内文件。 */
export function writeCollectionFormExport(cwd: string, out: string, form: CollectionForm): void {
  const normalized = normalizeProjectPath(cwd, out, { code: 'COLLECTION_FORM_OUTSIDE', message: '输出文件必须位于当前工程内且不在 .freelog/' });
  atomicWriteFile(path.resolve(cwd, normalized), `${JSON.stringify(form, null, 2)}\n`);
}

/** 将稳定外部表单协议完整映射为 updateCollection 的平台 payload。 */
export function toCollectionUpdatePayload(form: CollectionForm, resourceId: string, authExcludedItems: AuthExcludedItem[], isMergeCatalogueDraft: 0 | 1): Record<string, unknown> {
  return {
    resourceId,
    inputAttrs: form.inputs,
    customPropertyDescriptors: [
      ...form.properties.map((item) => ({ key: item.key, name: item.name, defaultValue: item.value, type: 'readonlyText' as const, remark: item.description })),
      ...form.options.map((item) => item.kind === 'input'
        ? ({ key: item.key, name: item.name, defaultValue: item.value!, type: 'editableText' as const, remark: item.description })
        : ({ key: item.key, name: item.name, defaultValue: item.values![0]!, type: 'select' as const, candidateItems: item.values!, remark: item.description })),
    ],
    description: form.description,
    catalogueProperty: {
      collection_sort_list: form.display.sort === 'ascending' ? 'collection_sort_ascending' : 'collection_sort_descending',
      collection_item_title: { 'resource-title': 'collection_item_title_rtitle', 'serial-number': 'collection_item_title_sn', custom: 'collection_item_title_custom', hidden: 'collection_item_title_empty' }[form.display.title],
      collection_item_no_display: form.display.number ? 'collection_item_no_display_show' : 'collection_item_no_display_hide',
      collection_item_image_display: form.display.image ? 'collection_item_image_display_show' : 'collection_item_image_display_hide',
      collection_item_descr_display: form.display.description ? 'collection_item_descr_display_show' : 'collection_item_descr_display_hide',
      collection_view: form.display.view === 'list' ? 'collection_view_list' : 'collection_view_card',
    },
    dependencies: form.dependencies,
    authExcludedItems,
    isMergeCatalogueDraft,
  };
}
