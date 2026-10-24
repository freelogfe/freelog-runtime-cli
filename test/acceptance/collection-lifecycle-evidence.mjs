/** Fixed full-field collection first/update slice. Never treats this slice as its parent matrix. */
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual as equal } from 'node:util';
import { lifecycleEvidence, loadConsoleRoundtripPrerequisite } from './console-roundtrip-evidence.mjs';
import { validateRetainedArtifact } from './lifecycle-artifact.mjs';

const assertionIds = Object.freeze(['run-binding', 'lifecycle-prerequisites', 'owner-and-type', 'commands-and-processes', 'full-form-stages', 'catalogue-stages', 'local-state', 'source-restoration', 'owned-cleanup']);
export const collectionLifecycleCases = Object.freeze([Object.freeze({ id: 'COLLECTION.LIFECYCLE.FIRST_UPDATE', script: 'verify-collection-lifecycle.mjs',
  kind: 'product-case', required: true, parentRule: 'COLLECTION.MANAGEMENT_MATRIX', assertionIds,
  title: 'Installed collection: full first publication and full field/catalogue update', layer: 'installed-candidate/real-dev/independent-sdk',
  inputClass: 'RT004005: system inputs, readonly/input/select, dependency, description, six display fields and two same-run owned online single resources',
  preconditions: ['Same-run/bin source-revalidated theme and PNG lifecycle PASS and retained artifacts.', 'Primary owner, enabled collection leaf with optional configuration and the fixed six-field current system profile.'],
  action: ['Bind owned sources and temporarily online.', 'Create collection shell; pull/edit/show/publish complete form and two items.', 'Pull/edit/rename/move/show/publish exact update.', 'Readonly resume absence; restore source shelf and clean only successful owned workspaces.'],
  forbiddenSideEffects: ['prod/test/node access', 'signing/payment', 'pool writes', 'remote deletion', 'unknown-result replay', 'failed workspace cleanup', 'collection online'],
  designRefs: [{ path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/测试/00-功能拓扑与证据驱动测试门禁.md', section: '8.3 固定候选完整字段生命周期叶子' },
    { path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/表单/01-属性-可选配置与展示.md', section: '完整表单协议与平台映射' },
    { path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/发布/01-发布合集变更与恢复.md', section: '完整读回与恢复' }],
})]);
const hash = (v) => createHash('sha256').update(v).digest('hex');
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const parse = (v) => { try { return JSON.parse(v); } catch { return null; } };
const ok = (v) => plain(v) && v.ret === 0 && v.errCode === 0 && plain(v.data);
const id24 = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/u.test(v);
const sha = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const absolute = (v) => typeof v === 'string' && path.isAbsolute(v) && path.resolve(v) === v;
/** ARCH01 selector, tied to its own successful CLI login rather than a four-field owner summary. */
export function collectionLoginSelectorValid(selector, owner, action, run) {
  const fields = ['schemaVersion', 'credentialKey', 'env', 'userId', 'username', 'createdAt'].sort();
  const iso = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  if (!plain(selector) || !equal(Object.keys(selector).sort(), fields) || selector.schemaVersion !== 1 || selector.env !== 'dev'
    || !Number.isSafeInteger(owner?.userId) || owner.userId <= 0 || typeof owner.username !== 'string' || !owner.username.startsWith('freelog')
    || selector.userId !== owner.userId || selector.username !== owner.username || selector.credentialKey !== `v1/dev/${owner.userId}`
    || ![selector.createdAt, action?.startedAt, action?.finishedAt, run?.startedAt, run?.deadlineAt].every(iso)) return false;
  const result = action.result;
  return result?.status === 0 && result.signal === null && result.error === null && result.timedOut === false && result.stderr === ''
    && result.stdout === `登录成功：${owner.username}\n`
    && Date.parse(run.startedAt) <= Date.parse(action.startedAt) && Date.parse(action.startedAt) <= Date.parse(selector.createdAt)
    && Date.parse(selector.createdAt) <= Date.parse(action.finishedAt) && Date.parse(action.finishedAt) <= Date.parse(run.deadlineAt);
}
export function collectionLifecycleForm(phase, dependencyId) {
  const update = phase === 'update';
  return { $schema: 'freelog-cli.collection-form.v1', inputs: [{ key: 'display_artist', value: update ? '更新演出者' : '首发演出者' }, { key: 'label_name', value: update ? '更新厂牌' : '首发厂牌' },
    { key: 'lyric_language', value: update ? 'en' : 'zh' }, { key: 'release_type', value: update ? '22' : '11' },
    { key: 'music_genre', value: update ? '2026-10-24 10:00:00' : '2026-10-23 09:00:00' }, { key: 'release_date', value: update ? '2026-10-24' : '2026-10-23' }],
    properties: [{ key: 'qaAuthor', name: '验收作者', value: update ? 'second' : 'first', description: update ? '更新作者说明' : '作者说明' }],
    options: [{ key: 'options_qaText', name: '验收文本', kind: 'input', value: update ? '更新文本' : '', description: update ? '更新文本说明' : '文本说明' },
      { key: 'options_qaSelect', name: '验收下拉', kind: 'select', values: update ? ['更新', '稳定'] : ['稳定', '更新'], description: update ? '更新下拉说明' : '下拉说明' }],
    description: update ? '合集完整字段更新说明' : '合集完整字段首发说明',
    display: update ? { sort: 'descending', title: 'custom', number: false, image: false, description: false, view: 'card' }
      : { sort: 'ascending', title: 'resource-title', number: true, image: true, description: true, view: 'list' },
    dependencies: [{ resourceId: dependencyId, versionRange: update ? '^1.1.0' : '^1.0.0' }] };
}
/** Fixed profile observed independently on 2026-10-23; platform drift blocks this bounded scenario. */
export function collectionLifecycleSystemConfigurationValid(o) {
  const keys = ['display_artist', 'label_name', 'lyric_language', 'release_type', 'music_genre', 'release_date'];
  const names = ['艺人', '厂牌', '语种', '类型', '风格', '发行日期'];
  const formats = [6, 6, 6, 10, 5, 4];
  const identifier = (v) => typeof v === 'string' && v.trim() !== '' && !/[\p{Cc}\p{Cf}]/u.test(v);
  if (!ok(o.typeInfo) || !Array.isArray(o.typeInfo.data.attrs) || !ok(o.systemMetadata)
    || !Array.isArray(o.systemMetadata.data.metaInfoArray) || !Array.isArray(o.systemDefinitions) || o.systemDefinitions.length !== 6) return false;
  const reservedKeys = new Map(), reservedNames = new Map();
  for (const row of o.typeInfo.data.attrs) {
    if (!plain(row) || !identifier(row.key) || !identifier(row.name) || reservedKeys.has(row.key) || reservedNames.has(row.name)) return false;
    reservedKeys.set(row.key, row.name); reservedNames.set(row.name, row.key);
  }
  if (!keys.every((key) => reservedKeys.has(key))) return false;
  const metadataKeys = new Set(), metadataNames = new Set(), writable = [];
  for (const row of o.systemMetadata.data.metaInfoArray) {
    if (!plain(row) || !identifier(row.key) || !identifier(row.name) || ![1, 2].includes(row.insertMode)
      || Object.keys(row).some((key) => !['key', 'name', 'insertMode', 'valueDisplay', 'remark'].includes(key))
      || Object.hasOwn(row, 'valueDisplay') && typeof row.valueDisplay !== 'string'
      || Object.hasOwn(row, 'remark') && typeof row.remark !== 'string'
      || metadataKeys.has(row.key) || metadataNames.has(row.name)
      || reservedKeys.has(row.key) && reservedKeys.get(row.key) !== row.name || reservedNames.has(row.name) && reservedNames.get(row.name) !== row.key) return false;
    metadataKeys.add(row.key); metadataNames.add(row.name);
    reservedKeys.set(row.key, row.name); reservedNames.set(row.name, row.key);
    if (row.insertMode === 2) writable.push(row.key);
  }
  // Fixed first-pull and payload order is deliberate; a different configuration blocks this scenario.
  if (!equal(writable, keys) || !equal(o.systemMetadata.data.metaInfoArray.filter((row) => row.insertMode === 2).map((row) => row.name), names)) return false;
  const forms = ['first', 'update'].map((phase) => collectionLifecycleForm(phase, ''));
  if (forms.some((form) => [...form.properties, ...form.options].some((p) => reservedKeys.has(p.key) || reservedNames.has(p.name)))) return false;
  return o.systemDefinitions.every((response, index) => {
    if (!ok(response) || !equal(Object.keys(response.data).sort(), ['contentRule', 'format', 'key'])
      || response.data.key !== keys[index] || response.data.format !== formats[index]) return false;
    const rule = response.data.contentRule;
    if (index === 3) return equal(rule, { allowedElements: ['11', '22', '33'] });
    // Missing/null rules in the actual response are projected to null; an empty default rule is equivalent.
    // No invented text/date bounds or generic production validator become the oracle.
    return rule === null || plain(rule) && Object.keys(rule).length === 0;
  });
}
export function collectionDisplayProperty(form) {
  const d = form.display;
  return { collection_sort_list: `collection_sort_${d.sort}`, collection_item_title: d.title === 'custom' ? 'collection_item_title_custom' : 'collection_item_title_rtitle',
    collection_item_no_display: `collection_item_no_display_${d.number ? 'show' : 'hide'}`, collection_item_image_display: `collection_item_image_display_${d.image ? 'show' : 'hide'}`,
    collection_item_descr_display: `collection_item_descr_display_${d.description ? 'show' : 'hide'}`, collection_view: `collection_view_${d.view}` };
}
export function collectionReadForm(version) {
  if (!ok(version)) throw new Error('Collection version envelope is not successful.');
  const v = version.data;
  if (!Array.isArray(v.systemPropertyDescriptors) || !Array.isArray(v.customPropertyDescriptors) || !Array.isArray(v.dependencies) || !plain(v.catalogueProperty) || !Array.isArray(v.authExcludedItems)) throw new Error('Incomplete collection read DTO.');
  for (const d of v.systemPropertyDescriptors) if (!plain(d) || ![1, 2].includes(d.insertMode) || typeof d.key !== 'string' || !d.key
    || d.insertMode === 2 && typeof d.valueDisplay !== 'string') throw new Error('Invalid system descriptor.');
  for (const d of v.customPropertyDescriptors) if (!plain(d) || !['readonlyText', 'editableText', 'select'].includes(d.type)
    || !['key', 'name', 'defaultValue'].every((k) => typeof d[k] === 'string') || d.remark !== undefined && typeof d.remark !== 'string'
    || d.type === 'select' && (!Array.isArray(d.candidateItems) || !d.candidateItems.every((v) => typeof v === 'string'))) throw new Error('Invalid custom descriptor.');
  return { inputs: v.systemPropertyDescriptors.filter((d) => d.insertMode === 2).map(({ key, valueDisplay }) => ({ key, value: valueDisplay })),
    properties: v.customPropertyDescriptors.map((d) => ({ key: d.key, name: d.name, type: d.type, value: d.defaultValue, description: d.remark ?? '', ...(d.type === 'select' ? { values: d.candidateItems } : {}) })),
    description: v.description, dependencies: v.dependencies.map(({ resourceId, versionRange }) => ({ resourceId, versionRange })),
    display: Object.fromEntries(Object.keys(collectionDisplayProperty(collectionLifecycleForm('first', ''))).map((k) => [k, v.catalogueProperty[k]])), authExcludedItems: v.authExcludedItems };
}
function expectedRead(form) {
  return { inputs: form.inputs, properties: [...form.properties.map((p) => ({ key: p.key, name: p.name, type: 'readonlyText', value: p.value, description: p.description })),
    ...form.options.map((p) => ({ key: p.key, name: p.name, type: p.kind === 'input' ? 'editableText' : 'select', value: p.kind === 'input' ? p.value : p.values[0], description: p.description, ...(p.kind === 'select' ? { values: p.values } : {}) }))],
    description: form.description, dependencies: form.dependencies, display: collectionDisplayProperty(form), authExcludedItems: [] };
}
/** Complete pages only: no short-page completion inference, coercion, duplicate IDs or top-level resource aliases. */
export function collectionCataloguePages(pages) {
  if (!Array.isArray(pages) || !pages.length) throw new Error('Missing complete catalogue pages.');
  let total, skip = 0; const result = [], seen = new Set();
  for (const page of pages) {
    if (!ok(page)) throw new Error('Catalogue envelope rejected.');
    const d = page.data;
    if (!Number.isSafeInteger(d.totalItem) || d.totalItem < 0 || d.skip !== skip || d.limit !== 100 || !Array.isArray(d.dataList)
      || total !== undefined && total !== d.totalItem || d.dataList.length !== Math.min(100, d.totalItem - skip)) throw new Error('Catalogue pagination differs.');
    total = d.totalItem;
    for (const item of d.dataList) {
      if (typeof item?.itemId !== 'string' || !item.itemId || seen.has(item.itemId) || !id24(item?.mountResourceInfo?.resourceId)
        || typeof item.itemTitle !== 'string' || typeof item.sortId !== 'number' || !Number.isFinite(item.sortId)) throw new Error('Catalogue item identity invalid.');
      seen.add(item.itemId); result.push({ itemId: item.itemId, resourceId: item.mountResourceInfo.resourceId, itemTitle: item.itemTitle, sortId: item.sortId });
    }
    skip += d.dataList.length;
  }
  if (skip !== total || pages.length !== Math.max(1, Math.ceil(total / 100))) throw new Error('Incomplete catalogue pages.');
  return result;
}
export function collectionLifecycleCommands(o) {
  const env = ['--env', 'dev'], select = ['--resource', 'file:1.json', ...env], sources = o.sources ?? [];
  const out = sources.flatMap((s) => [
    { label: `${s.kind} login`, argv: ['login', '--login-name', '<primary-login>', '--password-stdin', '--yes', ...env] },
    { label: `${s.kind} bind`, argv: ['bind', s.baseline?.data?.resourceId, '--artifact', s.kind === 'theme' ? 'dist' : 'photo-v2.png', '--yes', ...env] },
    { label: `${s.kind} online`, argv: ['online', '--yes', '--resource', 'file:1.json', '--json', ...env] },
  ]);
  out.push({ label: 'collection login', argv: ['login', '--login-name', '<primary-login>', '--password-stdin', '--yes', ...env] },
    { label: 'create', argv: ['collection', 'create', '--type', 'RT004005', '--title', '合集完整生命周期验收', '--name', `qa-cl-${o.runId?.slice(0, 12)}`, '--yes', ...env] });
  for (const phase of ['first', 'update']) {
    out.push({ label: `${phase} pull`, argv: ['collection', 'form', 'pull', '--out', `${phase}-pull.json`, '--yes', ...select] });
    if (phase === 'first') out.push({ label: 'items add', argv: ['collection', 'item', 'add', ...sources.map((s) => `id:${s.baseline?.data?.resourceId}`), '--yes', '--json', ...select] });
    else {
      out.push({ label: 'item rename', argv: ['collection', 'item', 'rename', o.itemIds?.[0], '--title', '更新单品标题', '--yes', ...select] },
        { label: 'item move', argv: ['collection', 'item', 'move', o.itemIds?.[1], '--before', o.itemIds?.[0], '--yes', ...select] });
    }
    out.push({ label: `${phase} edit`, argv: ['collection', 'form', 'edit', '--from', `${phase}-form.json`, ...select] },
      { label: `${phase} show`, argv: ['collection', 'form', 'show', ...select] },
      { label: `${phase} publish`, argv: ['collection', 'publish', '--include-items', 'yes', '--yes', ...select] });
  }
  out.push({ label: 'resume absent', argv: ['collection', 'publish', 'resume', '--json', ...select], error: 'COLLECTION_PUBLISH_INTENT_MISSING' });
  out.push(...sources.map((s) => ({ label: `${s.kind} restore offline`, argv: ['offline', '--yes', '--resource', 'file:1.json', '--json', ...env] })));
  return out;
}
export function collectionCommandOutput(o, label) {
  if (label.endsWith('login')) return `登录成功：${o.currentUser?.data?.username}\n`;
  if (label.endsWith(' bind')) return 'bind 成功，可用 status 查看\n';
  if (label.endsWith(' online') || label.endsWith(' restore offline')) {
    const s = o.sources?.find((s) => label.startsWith(`${s.kind} `));
    return { resourceId: s?.baseline?.data?.resourceId, status: label.endsWith(' online') ? 1 : 4, changed: true };
  }
  if (label === 'create') return `${o.collectionIdentity?.resourceId}\n`;
  if (label.endsWith(' pull')) return `已写出 ${label.split(' ')[0]}-pull.json，并刷新本地合集表单操作稿\n`;
  if (label === 'items add') return `已添加：${o.sources?.map((s) => s.baseline?.data?.resourceId).join('、')}；未变更：无\n`;
  if (label === 'item rename') return '';
  if (label === 'item move') {
    // The fixed operation puts image before the renamed theme. Derive this from
    // the pre-move identities, never from stdout or a later catalogue readback.
    const cell = (value) => String(value ?? '').replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu,
      (char) => char.split('').map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));
    const [theme, image] = (o.sources ?? []).map((s) => s.baseline?.data);
    return [[o.itemIds?.[1], image?.resourceId, image?.resourceTitle, image?.resourceName],
      [o.itemIds?.[0], theme?.resourceId, '更新单品标题', theme?.resourceName]].map((row) => row.map(cell).join('\t')).join('\n') + '\n';
  }
  if (label.endsWith(' edit') || label.endsWith(' show')) return collectionLifecycleForm(label.split(' ')[0], o.prerequisites?.image?.resourceId);
  if (label.endsWith(' publish')) return '合集变更已发布；未执行上架。\n';
  if (label === 'resume absent') return { code: 'COLLECTION_PUBLISH_INTENT_MISSING', message: '当前合集没有待核验的发布 intent' };
  throw new Error('Unknown fixed collection output.');
}
function localDraft(raw, id, form, baseline, observed) {
  const value = parse(raw?.utf8);
  const keys = ['schemaVersion', 'resourceId', 'resourceTypeCode', 'env', 'publishedBaselineFingerprint', 'baseline', 'form', 'authExcludedItems', 'authState', 'createdAt', 'updatedAt'].sort();
  return plain(raw) && typeof raw.utf8 === 'string' && raw.size === Buffer.byteLength(raw.utf8) && raw.sha256 === hash(raw.utf8)
    && plain(value) && equal(Object.keys(value).sort(), keys) && value.schemaVersion === 1 && value.resourceId === id && value.resourceTypeCode === 'RT004005' && value.env === 'dev'
    && equal(value.form, form) && equal(value.baseline, baseline) && value.authState === 'known-empty'
    && Number.isFinite(Date.parse(value.createdAt)) && Number.isFinite(Date.parse(value.updatedAt)) && Date.parse(value.createdAt) >= Date.parse(observed.startedAt)
    && Date.parse(value.updatedAt) >= Date.parse(value.createdAt) && Date.parse(value.updatedAt) <= Date.parse(observed.deadlineAt)
    && equal(value.authExcludedItems, []) && sha(value.publishedBaselineFingerprint) && hash(JSON.stringify(baseline)) === value.publishedBaselineFingerprint;
}
export function validateCollectionLifecycleFiles(o) {
  if (!absolute(o.cliBin) || !lstatSync(o.cliBin).isFile() || lstatSync(o.cliBin).isSymbolicLink() || realpathSync(o.cliBin) !== o.cliBin || hash(readFileSync(o.cliBin)) !== o.binSha256) throw new Error('Installed CLI bytes changed.');
  for (const kind of ['theme', 'image']) {
    const entry = o.prerequisites?.[kind];
    const loaded = loadConsoleRoundtripPrerequisite({ evidenceDir: o.evidenceDir, runId: o.runId, installed: { cliBin: o.cliBin, binSha256: o.binSha256 }, kind });
    if (entry?.resourceId !== loaded.source.resourceId || !equal(entry.prerequisite, loaded.prerequisite)) throw new Error('Collection lifecycle source files changed.');
    validateRetainedArtifact(loaded.source.retainedArtifact, { evidenceDir: o.evidenceDir, runId: o.runId });
  }
  return true;
}
export function evaluateCollectionLifecycleCase(id, o = {}) {
  if (id !== collectionLifecycleCases[0].id) throw new Error('Unknown collection lifecycle case.');
  const assertions = [], check = (id, expected, actual) => assertions.push({ id, expected, actual, passed: equal(expected, actual) });
  const issues = [];
  if (o.schemaVersion !== 1 || !/^[A-Za-z0-9-]{1,80}$/u.test(o.runId ?? '') || !absolute(o.cliBin) || !sha(o.binSha256) || !absolute(o.evidenceDir)
    || !Number.isFinite(Date.parse(o.startedAt)) || !Number.isFinite(Date.parse(o.finishedAt)) || !Number.isFinite(Date.parse(o.deadlineAt))
    || Date.parse(o.finishedAt) < Date.parse(o.startedAt) || Date.parse(o.finishedAt) > Date.parse(o.deadlineAt) || Date.parse(o.deadlineAt) - Date.parse(o.startedAt) > 1_200_000) issues.push('invalid run/bin/time binding');
  check('run-binding', [], issues);
  const prefix = ['theme', 'image'].map((kind) => lifecycleEvidence({ ...o, resourceKind: kind, resourceId: o.prerequisites?.[kind]?.resourceId, prerequisite: o.prerequisites?.[kind]?.prerequisite }));
  check('lifecycle-prerequisites', [[], []], prefix.map((p) => p.errors));
  const owner = o.currentUser?.data, identity = o.collectionIdentity, ownerIssues = [];
  if (!ok(o.currentUser) || !collectionLoginSelectorValid(o.auth, owner, o.actions?.find((a) => a.label === 'collection login'), o)) ownerIssues.push('owner/auth differs');
  if (!ok(o.typeInfo) || o.typeInfo.data.code !== 'RT004005' || o.typeInfo.data.status !== 1 || o.typeInfo.data.isTerminate !== true
    || ![o.typeInfo.data.subjectType].flat().includes(4) || o.typeInfo.data.resourceConfig?.supportOptionalConfig !== 2
    || !Array.isArray(o.typeInfo.data.attrs) || !['display_artist', 'label_name'].every((key) => o.typeInfo.data.attrs.some((a) => a?.key === key))) ownerIssues.push('unsupported collection type');
  if (!collectionLifecycleSystemConfigurationValid(o)) ownerIssues.push('fixed system metadata/definitions differ');
  const configuration = o.systemConfiguration;
  if (configuration?.resourceTypeCode !== 'RT004005' || !Number.isFinite(Date.parse(configuration.startedAt)) || !Number.isFinite(Date.parse(configuration.finishedAt))
    || Date.parse(configuration.startedAt) < Date.parse(o.startedAt) || Date.parse(configuration.finishedAt) < Date.parse(configuration.startedAt)
    || Date.parse(configuration.finishedAt) > Date.parse(o.deadlineAt)
    || (o.actions ?? []).filter((a) => a.label === 'create' || a.label.endsWith(' online') || a.label.endsWith(' publish') || a.label.endsWith(' restore offline') || ['items add', 'item rename', 'item move'].includes(a.label))
      .some((a) => !Number.isFinite(Date.parse(a.startedAt)) || Date.parse(a.startedAt) < Date.parse(configuration.finishedAt))) ownerIssues.push('configuration was not recorded before resource writes');
  if (!id24(identity?.resourceId) || identity.subject !== 'collection' || identity.env !== 'dev' || identity.typeCode !== 'RT004005' || identity.name !== `qa-cl-${o.runId?.slice(0, 12)}`
    || identity.resourceName !== `${owner?.username}/${identity.name}` || identity.title !== '合集完整生命周期验收') ownerIssues.push('collection immutable identity differs');
  for (const [index, kind] of ['theme', 'image'].entries()) {
    const s = o.sources?.[index], source = prefix[index].source;
    if (!collectionLoginSelectorValid(s?.auth, owner, o.actions?.find((a) => a.label === `${kind} login`), o)) ownerIssues.push(`${kind} login selector differs`);
    if (s?.kind !== kind || !ok(s.baseline) || !ok(s.online) || s.baseline.data.resourceId !== source?.resourceId || s.baseline.data.resourceName !== source?.resourceName
      || s.baseline.data.userId !== owner?.userId || s.baseline.data.status !== 4 || typeof s.baseline.data.latestVersion !== 'string' || !s.baseline.data.latestVersion
      || ![s.baseline.data.subjectType].flat().includes(1) || [s.baseline.data.subjectType].flat().some((type) => type !== 1) || typeof s.baseline.data.resourceTitle !== 'string'
      || !ok(s.knownVersion) || s.knownVersion.data.resourceId !== source?.resourceId || s.knownVersion.data.version !== '1.1.0'
      || s.baseline.data.isFrozen === true || s.online.data.status !== 1 || !equal({ ...s.online.data, status: 4 }, s.baseline.data)) ownerIssues.push(`${kind} source is not same-run owner/unchanged online`);
  }
  if (o.sources?.length !== 2 || prefix[0].source?.resourceId === prefix[1].source?.resourceId) ownerIssues.push('exactly two different lifecycle sources required');
  check('owner-and-type', [], ownerIssues);
  const commands = collectionLifecycleCommands(o), actions = Array.isArray(o.actions) ? o.actions : [];
  check('commands-and-processes', commands.map(({ label, argv, error }) => ({ label, argv, status: error ? 1 : 0, signal: null, error: null, timedOut: false, stderr: '', stdout: collectionCommandOutput(o, label) })),
    actions.map((a) => ({ label: a.label, argv: a.argv, status: a.result?.status ?? null, signal: a.result?.signal ?? null, error: a.result?.error ?? null, timedOut: a.result?.timedOut, stderr: a.result?.stderr,
      stdout: typeof collectionCommandOutput(o, a.label) === 'string' ? a.result?.stdout ?? null : parse(a.result?.stdout) })));
  const forms = [], catalogues = [], locals = []; let firstItems;
  for (const [index, phase] of ['first', 'update'].entries()) {
    const stage = o.stages?.[index], form = collectionLifecycleForm(phase, prefix[1].source?.resourceId);
    const fails = [], cats = [], local = [];
    const baseline = phase === 'first' ? { $schema: 'freelog-cli.collection-form.v1', inputs: [], properties: [], options: [], description: '', display: collectionLifecycleForm('first', '').display, dependencies: [] } : collectionLifecycleForm('first', prefix[1].source?.resourceId);
    const exported = phase === 'first' ? { ...baseline, inputs: ['display_artist', 'label_name', 'lyric_language', 'release_type', 'music_genre', 'release_date'].map((key) => ({ key, value: '' })) } : baseline;
    if (stage?.phase !== phase || !equal(stage.form, form) || !equal(stage.exported, exported)) fails.push('pull/form differs');
    for (const label of [`${phase} edit`, `${phase} show`]) if (!equal(parse(actions.find((a) => a.label === label)?.result?.stdout), form)) fails.push(`${label} JSON differs`);
    const published = stage?.published, info = published?.info;
    try { if (!equal(collectionReadForm(published?.version), expectedRead(form))) fails.push('full read DTO differs'); } catch { fails.push('full read DTO missing'); }
    if (!ok(info) || info.data.resourceId !== identity?.resourceId || info.data.resourceName !== identity?.resourceName || info.data.userId !== owner?.userId || info.data.status !== 4
      || ![info.data.subjectType].flat().includes(4) || typeof info.data.latestVersion !== 'string' || !info.data.latestVersion || published?.version?.data?.version !== info.data.latestVersion
      || published?.version?.data?.resourceId !== identity?.resourceId) fails.push('published identity/latest differs');
    try {
      const before = collectionCataloguePages(stage?.draftPagesBefore), after = collectionCataloguePages(published?.publishedPages), draft = collectionCataloguePages(published?.draftPages);
      if (index === 0) {
        firstItems = before;
        if (!equal(before.map((i) => i.resourceId), prefix.map((p) => p.source?.resourceId)) || !equal(o.itemIds, before.map((i) => i.itemId))
          || !equal(before.map((i) => i.itemTitle), o.sources?.map((s) => s.baseline?.data?.resourceTitle))) cats.push('first source order/IDs/title differs');
      } else {
        const expected = firstItems ? [firstItems[1], { ...firstItems[0], itemTitle: '更新单品标题' }] : [];
        if (!equal(before.map(({ sortId, ...v }) => v), expected.map(({ sortId, ...v }) => v))) cats.push('rename/move differs');
      }
      if (!equal(before, after) || !equal(after, draft)) cats.push('merge/published/draft differs');
      if (before.length !== 2 || new Set(before.map((i) => i.resourceId)).size !== 2 || !(before[0].sortId < before[1].sortId)) cats.push('directory is incomplete or unordered');
    } catch { cats.push('complete catalogue evidence missing'); }
    if (!localDraft(stage?.localBefore?.draft, identity?.resourceId, form, baseline, o) || !equal(stage?.localBefore?.identity, identity) || !equal(stage?.localAfter?.identity, identity)
      || stage?.localAfter?.draft !== null || !equal(stage?.localAfter?.intentFiles, []) || !equal(stage?.localBefore?.intentFiles, [])) local.push('local draft/identity/intent differs');
    forms.push(fails); catalogues.push(cats); locals.push(local);
  }
  const resume = actions.find((a) => a.label === 'resume absent');
  if (parse(resume?.result?.stdout)?.code !== 'COLLECTION_PUBLISH_INTENT_MISSING') locals.push(['resume did not prove absence']);
  check('full-form-stages', [[], []], forms); check('catalogue-stages', [[], []], catalogues); check('local-state', [[], []], locals);
  check('source-restoration', (o.sources ?? []).map((s) => s.baseline), (o.sources ?? []).map((s) => s.restored ?? null));
  const cleanupTargets = [...(o.sources ?? []).map((s, index) => ({ cwd: s.cwd, auth: s.auth, identity: { schemaVersion: 1, subject: 'resource', env: 'dev', resourceId: prefix[index]?.source?.resourceId,
    resourceName: prefix[index]?.source?.resourceName, name: prefix[index]?.source?.resourceName?.split('/')[1], title: s.baseline?.data?.resourceTitle,
    typeCode: prefix[index]?.source?.typeCode, filePath: s.kind === 'theme' ? 'dist' : 'photo-v2.png' } })), { cwd: o.cwd, auth: o.auth, identity }];
  check('owned-cleanup', cleanupTargets.map((t) => ({ cwd: t.cwd, argv: ['logout', '--env', 'dev'], authBefore: t.auth, identityBefore: t.identity,
    result: { status: 0, signal: null, error: null, timedOut: false, stdout: `已退出登录：${path.join(t.cwd ?? '', '.freelog/auth')}\n`, stderr: '' }, authAfter: 'absent', removed: true })), o.cleanupActions ?? null);
  const failed = assertions.filter((a) => !a.passed);
  return { id, status: failed.length ? 'FAIL' : 'PASS', assertions, observations: o, ...(failed.length ? { reason: `Collection lifecycle evidence differs: ${failed.map((a) => a.id).join(', ')}` } : {}) };
}
