/** Synthetic validator controls only. Never imported by the real-dev producer. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { consoleRoundtripFixture } from './console-roundtrip.mjs';
import { collectionLifecycleCommands, collectionLifecycleForm, collectionDisplayProperty, collectionCommandOutput } from '../../acceptance/collection-lifecycle-evidence.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
const clone = (v) => structuredClone(v);
const env = (data) => ({ ret: 0, errCode: 0, data });
const bytes = (value) => { const utf8 = `${JSON.stringify(value)}\n`; return { utf8, size: Buffer.byteLength(utf8), sha256: hash(utf8) }; };
const page = (items) => [env({ skip: 0, limit: 100, totalItem: items.length, dataList: items.map(({ resourceId, ...i }) => ({ ...i, mountResourceInfo: { resourceId } })) })];
export async function collectionLifecycleFixture() {
  const theme = await consoleRoundtripFixture('theme'), image = await consoleRoundtripFixture('image');
  const source = (base) => JSON.parse(base.prerequisite.rawText).observations;
  const t = source(theme), i = source(image), resourceId = 'c'.repeat(24), startedAt = '2026-10-19T00:00:00.000Z';
  const identity = { schemaVersion: 1, subject: 'collection', env: 'dev', resourceId, resourceName: `freelog-synthetic/qa-cl-${theme.runId.slice(0, 12)}`,
    name: `qa-cl-${theme.runId.slice(0, 12)}`, typeCode: 'RT004005', title: '合集完整生命周期验收' };
  const o = { schemaVersion: 1, runId: theme.runId, cliBin: theme.cliBin, binSha256: theme.binSha256, evidenceDir: theme.evidenceDir,
    startedAt, deadlineAt: '2026-10-19T00:20:00.000Z', finishedAt: '2026-10-19T00:10:00.000Z',
    prerequisites: { theme: { resourceId: t.resourceId, prerequisite: theme.prerequisite }, image: { resourceId: i.resourceId, prerequisite: image.prerequisite } },
    // ARCH01 §2.2 plus the actual 2026-10-19 selector field inventory, not an evaluator projection.
    currentUser: env({ userId: 12345, username: 'freelog-synthetic' }),
    auth: { schemaVersion: 1, credentialKey: 'v1/dev/12345', env: 'dev', userId: 12345, username: 'freelog-synthetic', createdAt: '2026-10-19T00:00:03.000Z' },
    // Synthetic envelopes use the independently observed 2026-10-23 RT004005 public profile.
    typeInfo: env({ code: 'RT004005', status: 1, isTerminate: true, subjectType: [4], resourceConfig: { supportOptionalConfig: 2 }, attrs: [
      { key: 'display_artist', name: '艺人' }, { key: 'label_name', name: '厂牌' }, { key: 'lyric_language', name: '语种' },
      { key: 'release_type', name: '类型' }, { key: 'music_genre', name: '风格' }, { key: 'collection_duration', name: '总时长' }, { key: 'release_date', name: '发行日期' }] }),
    systemMetadata: env({ metaInfoArray: [['display_artist', '艺人'], ['label_name', '厂牌'], ['lyric_language', '语种'], ['release_type', '类型'], ['music_genre', '风格'], ['release_date', '发行日期']]
      .map(([key, name]) => ({ key, name, insertMode: 2, valueDisplay: '' })) }),
    systemDefinitions: [['display_artist', 6], ['label_name', 6], ['lyric_language', 6], ['release_type', 10], ['music_genre', 5], ['release_date', 4]]
      .map(([key, format]) => env({ key, format, contentRule: key === 'release_type' ? { allowedElements: ['11', '22', '33'] } : null })),
    systemConfiguration: { resourceTypeCode: 'RT004005', startedAt: '2026-10-19T00:00:00.100Z', finishedAt: '2026-10-19T00:00:00.500Z' },
    collectionIdentity: identity, itemIds: ['item-theme', 'item-image'], actions: [], stages: [],
    cwd: path.join(path.parse(theme.cliBin).root, 'synthetic', 'collection'),
    sources: [t, i].map((s, n) => { const baseline = env({ resourceId: s.resourceId, resourceName: s.resourceName, resourceTitle: n === 0 ? '主题单品' : '图片单品', subjectType: 1, userId: 12345, status: 4, latestVersion: '1.1.0', isFrozen: false });
      return { kind: n === 0 ? 'theme' : 'image', cwd: path.join(path.parse(theme.cliBin).root, 'synthetic', n === 0 ? 'theme' : 'image'),
        auth: { schemaVersion: 1, credentialKey: 'v1/dev/12345', env: 'dev', userId: 12345, username: 'freelog-synthetic', createdAt: `2026-10-19T00:00:0${n + 1}.000Z` },
        baseline, knownVersion: env({ resourceId: s.resourceId, version: '1.1.0' }), online: env({ ...baseline.data, status: 1 }), restored: clone(baseline) }; }) };
  const firstItems = [{ itemId: 'item-theme', resourceId: t.resourceId, itemTitle: '主题单品', sortId: 1000 }, { itemId: 'item-image', resourceId: i.resourceId, itemTitle: '图片单品', sortId: 2000 }];
  for (const phase of ['first', 'update']) {
    const form = collectionLifecycleForm(phase, i.resourceId), items = phase === 'first' ? firstItems : [{ ...firstItems[1], sortId: 0 }, { ...firstItems[0], itemTitle: '更新单品标题' }];
    // Published absence stays immutable; only the first editable export gains current blank keys.
    const baseline = phase === 'first' ? { $schema: 'freelog-cli.collection-form.v1', inputs: [], properties: [], options: [], description: '', display: collectionLifecycleForm('first', '').display, dependencies: [] } : collectionLifecycleForm('first', i.resourceId);
    const exported = phase === 'first' ? { ...baseline, inputs: ['display_artist', 'label_name', 'lyric_language', 'release_type', 'music_genre', 'release_date'].map((key) => ({ key, value: '' })) } : clone(baseline);
    const version = phase === 'first' ? 'snapshot-first' : 'snapshot-update';
    o.stages.push({ phase, form, exported, draftPagesBefore: page(items),
      localBefore: { identity: clone(identity), intentFiles: [], draft: bytes({ schemaVersion: 1, resourceId, resourceTypeCode: 'RT004005', env: 'dev', baseline, form,
        publishedBaselineFingerprint: hash(JSON.stringify(baseline)), authExcludedItems: [], authState: 'known-empty', createdAt: startedAt, updatedAt: startedAt }) },
      localAfter: { identity: clone(identity), draft: null, intentFiles: [] },
      published: { info: env({ resourceId, resourceName: identity.resourceName, userId: 12345, status: 4, subjectType: 4, latestVersion: version }),
        version: env({ resourceId, version, systemPropertyDescriptors: form.inputs.map(({ key, value }) => ({ key, insertMode: 2, valueDisplay: value })),
          customPropertyDescriptors: [...form.properties.map((p) => ({ key: p.key, name: p.name, type: 'readonlyText', defaultValue: p.value, remark: p.description })),
            ...form.options.map((p) => ({ key: p.key, name: p.name, type: p.kind === 'input' ? 'editableText' : 'select', defaultValue: p.value ?? p.values[0], remark: p.description, ...(p.values ? { candidateItems: p.values } : {}) }))],
          dependencies: form.dependencies, description: form.description, catalogueProperty: collectionDisplayProperty(form), authExcludedItems: [] }), publishedPages: page(items), draftPages: page(items) } });
  }
  // Independent positive control from the fixed move operation and four-column product contract.
  // Do not let the evaluator generate the move result it is supposed to verify.
  const moveOutput = `item-image\t${i.resourceId}\t图片单品\t${i.resourceName}\nitem-theme\t${t.resourceId}\t更新单品标题\t${t.resourceName}\n`;
  o.actions = collectionLifecycleCommands(o).map(({ label, argv, error }) => ({ label, argv, startedAt: '2026-10-19T00:00:10.000Z', finishedAt: '2026-10-19T00:00:11.000Z', result: { status: error ? 1 : 0, signal: null, error: null, timedOut: false, stderr: '',
    stdout: label === 'item move' ? moveOutput : typeof collectionCommandOutput(o, label) === 'string' ? collectionCommandOutput(o, label) : JSON.stringify(collectionCommandOutput(o, label)) } }));
  for (const target of [...o.sources, o]) {
    const action = o.actions.find((a) => a.label === (target === o ? 'collection login' : `${target.kind} login`));
    action.startedAt = target.auth.createdAt; action.finishedAt = target.auth.createdAt.replace('.000Z', '.500Z');
  }
  o.cleanupActions = [...o.sources.map((s, n) => ({ cwd: s.cwd, auth: s.auth, identity: { schemaVersion: 1, subject: 'resource', env: 'dev', resourceId: [t, i][n].resourceId,
    resourceName: [t, i][n].resourceName, name: [t, i][n].resourceName.split('/')[1], title: s.baseline.data.resourceTitle, typeCode: [t, i][n].typeCode, filePath: n === 0 ? 'dist' : 'photo-v2.png' } })), { cwd: o.cwd, auth: o.auth, identity }]
    .map(({ cwd, auth, identity }) => ({ cwd, argv: ['logout', '--env', 'dev'], authBefore: clone(auth), identityBefore: clone(identity),
      result: { status: 0, signal: null, error: null, timedOut: false, stdout: `已退出登录：${path.join(cwd, '.freelog/auth')}\n`, stderr: '' }, authAfter: 'absent', removed: true }));
  return o;
}
