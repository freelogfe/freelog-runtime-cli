/** Synthetic evaluator controls only: never candidate approval or an installed CLI execution. */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { recoveryFixture, recoveryBody, recoveryVersion, recoveryDraft } from '../../acceptance/collection-recovery-evidence.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const fingerprint = (value) => hash(JSON.stringify(value));
const clone = (value) => structuredClone(value);
const paths = { draft: '.freelog/collection-forms/dev/local_collection.json', intent: '.freelog/collection-forms/intents/local_collection.json',
  lock: '.freelog/.lock', txn: '.freelog/.txn.json', sequence: '.freelog/.sequence' };
const json = (value) => `${JSON.stringify(value)}\n`;

// Product §3/4 outcomes are declared here, not obtained from evaluateCollectionRecovery.
const cases = [
  ['prepared', false, 'prepared', 'unconfirmed', 'unchanged'],
  ['sending', false, 'sending', 'unconfirmed', 'unchanged'],
  ['uncommitted', false, 'unknown', 'unconfirmed', 'unchanged'],
  ['committed', true, 'unknown', 'confirmed', 'unchanged'],
  ['changed', true, 'unknown', 'confirmed', 'changed'],
  ['broken', true, 'unknown', 'confirmed', 'changed'],
  ['new-draft', true, 'unknown', 'confirmed', 'changed'],
  ['wrong-resource', true, 'unknown', null, 'unchanged'],
  ['wrong-version', true, 'unknown', null, 'unchanged'],
  ['wrong-form', true, 'unknown', 'unconfirmed', 'unchanged'],
  ['wrong-auth', true, 'unknown', 'unconfirmed', 'unchanged'],
  ['wrong-directory', true, 'unknown', 'unconfirmed', 'unchanged'],
  ['cleanup', true, 'sending', 'confirmed', 'absent'],
  ['rejected', false, 'rejected', 'rejected', 'unchanged'],
  ['legacy', true, 'unknown', 'legacy-unverifiable', 'changed'],
  ['invalid-intent', true, 'unknown', null, 'unchanged'],
  ['payload-mismatch', true, 'unknown', null, 'unchanged'],
  ['wrong-env', true, 'unknown', null, 'unchanged'],
  ['wrong-owner', true, 'unknown', null, 'unchanged'],
  ['wrong-type', true, 'unknown', null, 'unchanged'],
  ['readonly-txn', true, 'unknown', 'confirmed', 'unchanged'],
];
const messages = {
  COLLECTION_PUBLISH_PENDING: '合集有未决发布；请先 collection publish resume 核验，不能覆盖记录或重发',
  COLLECTION_PUBLISH_RESULT_UNKNOWN: '合集发布结果未知；请 collection publish resume 核验，不要重发',
  COLLECTION_PUBLISH_CLEANUP_FAILED: '线上已确认发布，但本地收尾未完成；请 collection publish resume 核验，不要重发',
  COLLECTION_PUBLISH_REJECTED_CLEANUP_FAILED: '平台已明确拒绝且旧快照未变，但本地记录清理失败；请 collection publish resume 核验',
  COLLECTION_FORM_RESPONSE_INVALID: '已发布合集快照身份或版本不匹配',
  COLLECTION_RECOVER_UNCONFIRMED: '线上完整快照尚未确认；已保留发布记录和当前稿，不会重发',
  COLLECTION_PUBLISH_INTENT_LEGACY: '旧发布记录缺少可验证快照，已保留，不能自动收尾',
};
const result = (status, value) => ({ status, signal: null, error: null, timedOut: false, stderr: '', stdout: value === undefined ? '' : json(value) });
const failure = (code, message = messages[code]) => result(1, { code, message });
const request = (method, route, body = null) => ({ method, path: route, body });
const base = '/v2/resources/catalogue/local_collection';
const info = () => request('GET', '/v2/resources/local_collection?isLoadLatestVersionInfo=1&isLoadPolicyInfo=1');
const observe = (version = 'snapshot_0', stopAtVersion = false) => [info(), request('GET', `/v2/resources/local_collection/versions/${version}`),
  ...(stopAtVersion ? [] : [request('GET', `${base}/items?skip=0&limit=100&sortField=sortId&sortType=1`),
    request('GET', '/v2/resources/catalogues/drafts/local_collection/items?skip=0&limit=100&sortField=sortId&sortType=1')])];
const types = () => [request('GET', '/v2/resources/types/listSimpleByGroup?category=1&status=1&subjectType=4'),
  request('GET', '/v2/resources/types/getInfoByCode?code=CT001'),
  request('GET', '/v2/storages/files/info?resourceTypeCode=CT001'),
  request('GET', '/v2/resources/attrs/getInfoByKey?key=display_artist')];
const rules = () => [info(), request('GET', `${base}/items/collectRules`)];
function stageReads(name, stageName, committed) {
  if (stageName === 'repeat') return [info()];
  if (stageName === 'publish') return [info(), ...observe(), ...types(), ...rules(), ...rules(), ...types(), ...observe()];
  if (['legacy', 'invalid-intent', 'payload-mismatch', 'wrong-env', 'wrong-owner', 'wrong-type'].includes(name)) return [info()];
  return [info(), ...observe(committed ? 'snapshot_1' : 'snapshot_0', ['wrong-resource', 'wrong-version'].includes(name))];
}

/** Lossless byte snapshot helper; callers mutate copies for rejection controls. */
export function recoverySnapshot(entries) {
  return Object.entries(entries).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, bytes]) => ({ path: file,
    kind: bytes === null ? 'directory' : 'file', ...(bytes === null ? {} : { bytes: Buffer.from(bytes).toString('base64') }) }));
}
export function changeRecoverySnapshot(snapshot, file, value) {
  const entries = Object.fromEntries(snapshot.map((entry) => [entry.path, entry.kind === 'directory' ? null : Buffer.from(entry.bytes, 'base64').toString('utf8')]));
  if (value === undefined) delete entries[file]; else entries[file] = value;
  return recoverySnapshot(entries);
}
export function recoverySnapshotText(snapshot, file) {
  const entry = snapshot.find((item) => item.path === file);
  return entry?.kind === 'file' ? Buffer.from(entry.bytes, 'base64').toString('utf8') : undefined;
}

/** Materialize stage originals only under the caller's fresh synthetic temporary root. */
export function collectionRecoveryFixture(root) {
  const evidenceDir = path.join(root, 'raw');
  mkdirSync(evidenceDir, { recursive: true });
  const observed = { runId: 'synthetic-recovery-controls', evidenceDir,
    cliBin: path.join(root, 'installed', 'node_modules', '@freelog-cli', 'cli2', 'dist', 'bin', 'index.js'),
    packageName: '@freelog-cli/cli2', version: '0.0.0-synthetic', binSha256: 'a'.repeat(64), platform: process.platform,
    nodeVersion: 'v22.0.0', startedAt: '2026-10-19T00:00:00.000Z', finishedAt: '2026-10-19T00:10:00.000Z',
    apparatusErrors: [], scenarios: [] };
  for (const [index, [name, committed, intentState, verification, localDraft]] of cases.entries()) {
    const f = recoveryFixture();
    const cwd = path.join(root, `work-${name}`), controls = path.join(root, `controls-${name}`), initialDraft = name === 'new-draft' ? undefined : json(recoveryDraft(clone(f.form)));
    const entries = { '.freelog': null, '.freelog/collection-forms': null, '.freelog/collection-forms/dev': null,
      '.freelog/collection-forms/intents': null, '.freelog/auth': json(f.selector), '.freelog/1.json': json(f.identity),
      [paths.sequence]: '1\n', 'keep.txt': 'local recovery sentinel\n', ...(initialDraft === undefined ? {} : { [paths.draft]: initialDraft }) };
    const startedAt = (stage) => new Date(Date.parse(observed.startedAt) + index * 20000 + stage * 2000).toISOString();
    const finishedAt = (stage) => new Date(Date.parse(startedAt(stage)) + 1000).toISOString();
    const expectedForm = name === 'new-draft' ? f.baseline : f.form;
    const directoryHash = (rows) => fingerprint(rows.map(({ itemId, itemTitle, sortId, mountResourceInfo }) => ({ itemId, resourceId: mountResourceInfo.resourceId, itemTitle, sortId })));
    const marker = { schemaVersion: 2, resourceId: f.resourceId, resourceName: f.resourceName, resourceTypeCode: f.typeCode, env: 'dev', userId: 7,
      state: intentState, baselineFingerprint: fingerprint(f.baseline), baselineAuthFingerprint: fingerprint(f.auth),
      baselineDirectoryFingerprint: directoryHash(f.published), expectedForm, expectedAuthExcludedItems: f.auth, merge: 1,
      directoryFingerprint: directoryHash(f.draft), payloadSha256: fingerprint({ resourceId: f.resourceId, ...recoveryBody(expectedForm, 1, f.auth) }),
      sourceDraftSha256: initialDraft === undefined ? null : hash(initialDraft), sentAt: startedAt(0),
      ...(name === 'rejected' ? { rejection: { ret: 1, errCode: 77 } } : {}) };
    const stages = [];
    for (const [stageIndex, stageName] of ['publish', 'repeat', 'inspect', 'apply'].entries()) {
      if (stageName === 'inspect') {
        if (['changed', 'new-draft'].includes(name)) { const draft = recoveryDraft(clone(f.form)); if (name === 'changed') draft.form.description = 'edited after unknown publish'; entries[paths.draft] = json(draft); }
        if (name === 'broken') entries[paths.draft] = '{broken local draft\n';
        if (name === 'legacy') entries[paths.intent] = json({ schemaVersion: 1, resourceId: f.resourceId, state: 'unknown' });
        if (name === 'invalid-intent') entries[paths.intent] = '{"schemaVersion":2,\n';
        if (['payload-mismatch', 'wrong-env', 'wrong-owner', 'wrong-type'].includes(name)) {
          const changed = clone(marker);
          if (name === 'payload-mismatch') changed.payloadSha256 = '0'.repeat(64);
          if (name === 'wrong-env') changed.env = 'test';
          if (name === 'wrong-owner') changed.userId = 8;
          if (name === 'wrong-type') changed.resourceTypeCode = 'CT999';
          entries[paths.intent] = json(changed);
        }
        if (name === 'readonly-txn') entries[paths.txn] = json({ schemaVersion: 1, entries: [{ path: '.sequence', before: '1\n', beforeSha256: hash('1\n'), after: '2\n', afterSha256: hash('2\n') }] });
      }
      const childPid = 1000 + index * 4 + stageIndex, before = recoverySnapshot(entries), requests = stageReads(name, stageName, committed);
      let outcome;
      if (stageName === 'publish') {
        entries[paths.intent] = json(marker);
        if (['prepared', 'sending'].includes(name)) { entries[paths.lock] = json({ pid: childPid, startedAt: startedAt(0), command: 'collection-publish' }); outcome = result(86); }
        else {
          requests.push(request('PUT', base, recoveryBody(expectedForm, 1, f.auth)));
          if (['cleanup', 'rejected'].includes(name)) requests.push(...observe(name === 'cleanup' ? 'snapshot_1' : 'snapshot_0'));
          if (name === 'cleanup') delete entries[paths.draft];
          outcome = failure(name === 'cleanup' ? 'COLLECTION_PUBLISH_CLEANUP_FAILED' : name === 'rejected'
            ? 'COLLECTION_PUBLISH_REJECTED_CLEANUP_FAILED' : 'COLLECTION_PUBLISH_RESULT_UNKNOWN');
        }
      } else if (stageName === 'repeat') { delete entries[paths.lock]; outcome = failure('COLLECTION_PUBLISH_PENDING'); }
      else {
        const invalid = ['invalid-intent', 'payload-mismatch', 'wrong-env', 'wrong-owner', 'wrong-type'].includes(name);
        if (['wrong-resource', 'wrong-version'].includes(name)) outcome = failure('COLLECTION_FORM_RESPONSE_INVALID');
        else if (invalid) outcome = failure('COLLECTION_PUBLISH_INTENT_INVALID', name === 'invalid-intent' ? '发布 intent 无法解析'
          : name === 'payload-mismatch' ? '发布 intent 的预期快照或摘要无效' : '发布 intent 的环境、账号或合集身份不匹配');
        else if (stageName === 'apply' && verification === 'legacy-unverifiable') outcome = failure('COLLECTION_PUBLISH_INTENT_LEGACY');
        else if (stageName === 'apply' && verification === 'unconfirmed') outcome = failure('COLLECTION_RECOVER_UNCONFIRMED');
        else {
          const applied = stageName === 'apply';
          outcome = result(0, { schemaVersion: 1, resourceId: f.resourceId, env: 'dev', intentState, verification, localDraft, applied });
          if (applied) {
            delete entries[paths.intent];
            if (!['changed', 'broken', 'new-draft', 'rejected'].includes(name)) delete entries[paths.draft];
            if (name === 'readonly-txn') { delete entries[paths.txn]; entries[paths.sequence] = '2\n'; }
          }
        }
      }
      const remoteForm = committed && name !== 'new-draft' ? f.form : f.baseline;
      const remote = { version: recoveryVersion(clone(remoteForm), committed ? 'snapshot_1' : 'snapshot_0', clone(f.auth)), published: clone(committed ? f.draft : f.published), draft: clone(f.draft) };
      if (['inspect', 'apply'].includes(stageName)) {
        if (name === 'wrong-resource') remote.version.resourceId = 'other_collection';
        if (name === 'wrong-version') remote.version.version = 'snapshot_other';
        if (name === 'wrong-form') remote.version.description = 'different remote form';
        if (name === 'wrong-auth') remote.version.authExcludedItems[0].excludedValue = 'wrong_exclusion';
        if (name === 'wrong-directory') remote.published[0].itemTitle = 'wrong published item title';
      }
      const events = [{ event: 'ready', guard: 'collection-recovery-local-v1' }, { event: 'keyring-replaced' }, { event: 'keyring-get' },
        ...requests.map(({ method, path: route }) => ({ event: 'request', method, path: route }))];
      if (stageName === 'publish' && ['prepared', 'sending'].includes(name)) events.push({ event: 'fault', kind: name, exitCode: 86 });
      if (stageName === 'publish' && ['cleanup', 'rejected'].includes(name)) events.push({ event: 'fault', kind: 'intent-unlink' });
      events.push({ event: 'finished' });
      const stage = { name: stageName, argv: ['collection', 'publish', ...(['inspect', 'apply'].includes(stageName) ? ['resume'] : []),
        ...(stageName === 'apply' ? ['--apply'] : []), ...(['publish', 'repeat'].includes(stageName) ? ['--include-items', 'auto'] : []),
        '--resource', 'id:local_collection', '--env', 'dev', '--json', ...(stageName === 'inspect' ? [] : ['--yes'])],
      startedAt: startedAt(stageIndex), finishedAt: finishedAt(stageIndex), childPid, before, after: recoverySnapshot(entries), requests, remote,
      trace: events.map((event) => JSON.stringify({ schemaVersion: 1, ...event })).join('\n') + '\n', result: outcome, apparatusErrors: [] };
      const rawPath = path.join(evidenceDir, `${name}-${stageName}.json`), raw = json(stage);
      writeFileSync(rawPath, raw);
      stage.evidenceRef = { path: rawPath, sha256: hash(raw) }; stages.push(stage);
    }
    observed.scenarios.push({ name, cwd, controls, stages });
  }
  return observed;
}
