#!/usr/bin/env node
/** Real installed CLI producer. Imports never log in, read credentials or issue remote requests. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual as equal } from 'node:util';
import { requireInstalledCli } from './verify-command-parameters.mjs';
import { createConsoleRoundtripBudget, consoleSdkRead } from './verify-console-roundtrip.mjs';
import { loadConsoleRoundtripPrerequisite, projectConsoleOwner } from './acceptance/console-roundtrip-evidence.mjs';
import { managementSdkProjection } from './acceptance/resource-management-evidence.mjs';
import { validateRetainedArtifact } from './acceptance/lifecycle-artifact.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { readPrivateJson } from './acceptance/read-private-json.mjs';
import { redactEvidence } from './acceptance/evidence-redaction.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { collectionLifecycleCases, collectionLifecycleForm, collectionLifecycleCommands, collectionCataloguePages, collectionCommandOutput,
  evaluateCollectionLifecycleCase, validateCollectionLifecycleFiles, collectionLoginSelectorValid, collectionLifecycleSystemConfigurationValid } from './acceptance/collection-lifecycle-evidence.mjs';

const root = fileURLToPath(new URL('.', import.meta.url)), leaf = collectionLifecycleCases[0];
const hash = (v) => createHash('sha256').update(v).digest('hex');
class HarnessError extends Error { constructor(status, message) { super(message); this.status = status; } }
const assert = (value, message, status = 'FAIL') => { if (!value) throw new HarnessError(status, message); };
const envelope = (v) => v && v.ret === 0 && v.errCode === 0 && v.data && typeof v.data === 'object' && !Array.isArray(v.data);
function readJson(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { throw new HarnessError('FAIL', 'An owned JSON observation could not be read; parser excerpts withheld.'); } }
function publicUser(value) { return projectConsoleOwner(value, {}).currentUser; }
function publicType(value) {
  return { ret: value?.ret ?? null, errCode: value?.errCode ?? null, data: value?.data ? Object.fromEntries(['code', 'status', 'isTerminate', 'subjectType', 'resourceConfig', 'attrs'].map((k) => [k, value.data[k] ?? null])) : null };
}
/** Independent readonly prerequisite; never infer writable fields or rules from CLI output. */
export async function readCollectionSystemConfiguration(sdk, read, observations) {
  const project = (value, fields) => ({ ret: value?.ret ?? null, errCode: value?.errCode ?? null,
    data: value?.data && typeof value.data === 'object' && !Array.isArray(value.data)
      ? Object.fromEntries(fields.map((key) => [key, value.data[key] ?? null])) : null });
  observations.systemConfiguration = { resourceTypeCode: 'RT004005', startedAt: new Date().toISOString(), finishedAt: null };
  observations.systemDefinitions = [];
  try {
    const metadata = project(await read(() => sdk.FServiceAPI.Storage.filesInfo({ resourceTypeCode: 'RT004005' })), ['metaInfoArray']);
    if (Array.isArray(metadata.data?.metaInfoArray)) metadata.data.metaInfoArray = metadata.data.metaInfoArray.map((row) => row && typeof row === 'object' && !Array.isArray(row)
      ? Object.fromEntries(['key', 'name', 'insertMode', 'valueDisplay', 'remark'].filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])) : null);
    observations.systemMetadata = metadata;
    assert(envelope(metadata) && Array.isArray(metadata.data.metaInfoArray), 'Current collection metadata is unavailable; no resource writes were issued.', 'BLOCKED');
    for (const key of ['display_artist', 'label_name', 'lyric_language', 'release_type', 'music_genre', 'release_date']) {
      const definition = project(await read(() => sdk.FServiceAPI.Resource.getAttrsInfoByKey({ key })), ['key', 'format', 'contentRule']);
      observations.systemDefinitions.push(definition);
      assert(envelope(definition), 'Current collection system definition is unavailable; no resource writes were issued.', 'BLOCKED');
    }
    assert(collectionLifecycleSystemConfigurationValid(observations), 'Current collection system fields, formats or rules differ from the fixed lifecycle scenario; no resource writes were issued.', 'BLOCKED');
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    throw new HarnessError('BLOCKED', 'Current collection configuration read failed; no resource writes were issued.');
  } finally { observations.systemConfiguration.finishedAt = new Date().toISOString(); }
}
/** Explicit collection projection retains full relevant read descriptors/catalogue/auth; never manufactures success. */
function versionObservation(value) {
  const data = value?.data;
  return { ret: value?.ret ?? null, errCode: value?.errCode ?? null, data: data && typeof data === 'object' && !Array.isArray(data)
    ? Object.fromEntries(['resourceId', 'version', 'systemPropertyDescriptors', 'customPropertyDescriptors', 'dependencies', 'description', 'catalogueProperty', 'authExcludedItems'].map((k) => [k, data[k] ?? null])) : null };
}
function collectionInfo(value) {
  const data = value?.data;
  return { ret: value?.ret ?? null, errCode: value?.errCode ?? null, data: data && typeof data === 'object' && !Array.isArray(data)
    ? Object.fromEntries(['resourceId', 'resourceName', 'userId', 'status', 'subjectType', 'latestVersion'].map((k) => [k, data[k] ?? null])) : null };
}
function diskState(work, id) {
  const file = path.join(work, '.freelog', 'collection-forms', 'dev', `${id}.json`), intents = path.join(work, '.freelog', 'collection-forms', 'intents');
  let draft = null;
  if (existsSync(file)) { assert(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink(), 'The owned draft is not a regular file.');
    const bytes = readFileSync(file); draft = { utf8: bytes.toString('utf8'), size: bytes.length, sha256: hash(bytes) }; }
  return { identity: readJson(path.join(work, '.freelog', '1.json')), draft,
    intentFiles: existsSync(intents) ? readdirSync(intents).sort() : [] };
}
/** Read only a regular owned selector; validate before it may enter persisted observations. */
export function readCollectionLoginSelector(work, owner, action, run) {
  const file = path.join(work, '.freelog/auth');
  assert(existsSync(file) && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink(), 'CLI login selector is not a regular file.');
  const selector = readPrivateJson(file);
  assert(collectionLoginSelectorValid(selector, owner, action, run), 'CLI login selector differs from the account and login window.');
  return selector;
}
/** Called only after the business chain has passed. A local selector must still be owned before logout can choose its target. */
export function cleanupCollectionWorkspace(work, expectedState, runLogout, observe = () => {}) {
  const authFile = path.join(work, '.freelog/auth');
  const observation = { cwd: work, argv: ['logout', '--env', 'dev'], authBefore: null, identityBefore: null, result: null, authAfter: 'present', removed: false };
  observe(observation);
  cleanupWorkspace(work, { success: true, prefixes: ['freelog-collection-lifecycle-'], log() {}, beforeRemove() {
    assert(existsSync(authFile) && lstatSync(authFile).isFile() && !lstatSync(authFile).isSymbolicLink(), 'Owned selector unavailable before cleanup; logout was not issued.');
    const authBefore = readPrivateJson(authFile), identityBefore = readJson(path.join(work, '.freelog/1.json'));
    assert(equal(authBefore, expectedState.auth) && equal(identityBefore, expectedState.identity), 'Owned selector or identity changed before cleanup; logout was not issued.');
    // A replaced file may contain secrets: do not persist it before equality with the validated original.
    observation.authBefore = authBefore; observation.identityBefore = identityBefore;
    observation.result = runLogout(observation.argv);
    const r = observation.result;
    assert(r?.status === 0 && r.signal === null && r.error === null && r.timedOut === false && r.stderr === ''
      && r.stdout === `已退出登录：${authFile}\n` && !existsSync(authFile), 'Owned logout was not exactly confirmed; workspace retained.');
    observation.authAfter = 'absent';
  } });
  observation.removed = !existsSync(work); return observation;
}

export async function runCollectionLifecycle({ env = process.env, argv = process.argv.slice(2), output = env.FREELOG_TEST_SUITE_REPORT } = {}) {
  let result = { id: leaf.id, status: 'NOT_TESTED', assertions: [], reason: 'The full collection chain has not executed.' }, o, helpers;
  const secrets = [], workspaces = [], budget = createConsoleRoundtripBudget({ totalMs: 20 * 60_000 });
  const safe = (v) => redactEvidence(helpers ? helpers.redact(v) : v, secrets);
  const persist = () => { if (typeof output === 'string' && path.isAbsolute(output)) { mkdirSync(path.dirname(output), { recursive: true }); writeSuiteCases([{ ...result, ...(o ? { observations: o } : {}) }], output); } };
  try {
    const args = argv.filter((v) => v !== '--skip-build');
    assert(!args.length || equal(args, ['--env', 'dev']), 'Only --env dev is permitted.', 'BLOCKED');
    assert(typeof output === 'string' && path.isAbsolute(output) && /^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID ?? '')
      && env.FREELOG_TEST_RUN_ID === process.env.FREELOG_TEST_RUN_ID, 'An actual run-bound absolute report is required.', 'BLOCKED');
    let installed, prerequisites;
    try { installed = requireInstalledCli(env); prerequisites = Object.fromEntries(['theme', 'image'].map((kind) => {
      const loaded = loadConsoleRoundtripPrerequisite({ evidenceDir: path.dirname(output), runId: env.FREELOG_TEST_RUN_ID, installed, kind });
      validateRetainedArtifact(loaded.source.retainedArtifact, { evidenceDir: path.dirname(output), runId: env.FREELOG_TEST_RUN_ID });
      return [kind, loaded];
    })); } catch { throw new HarnessError('BLOCKED', 'Same-run installed lifecycle source files/artifacts unavailable; credentials were not accessed.'); }
    o = { schemaVersion: 1, ...installed, runId: env.FREELOG_TEST_RUN_ID, evidenceDir: path.dirname(output), startedAt: budget.startedAt, deadlineAt: budget.deadlineAt,
      prerequisites: Object.fromEntries(Object.entries(prerequisites).map(([kind, l]) => [kind, { resourceId: l.source.resourceId, prerequisite: l.prerequisite }])), sources: [], actions: [], stages: [], itemIds: [] };
    let primary;
    try { primary = readPrivateJson(path.join(root, '.freelog-test-credentials.local.json')).primary; } catch { throw new HarnessError('BLOCKED', 'The private primary account is unavailable; contents withheld.'); }
    assert(primary?.loginName?.startsWith('freelog') && typeof primary.password === 'string' && primary.password, 'Authorized primary account unavailable.', 'BLOCKED');
    secrets.push(primary.password);
    helpers = await import('./dependency-declaration-helpers.mjs');
    const sdk = await import('../packages/tools-lib/dist/node.mjs');
    await budget.call(() => helpers.loginForApi(primary));
    const read = (f) => consoleSdkRead(budget, sdk, f);
    o.currentUser = publicUser(await read(() => sdk.FServiceAPI.User.currentUserInfo({})));
    assert(envelope(o.currentUser) && Number.isSafeInteger(o.currentUser.data.userId) && o.currentUser.data.username === primary.loginName, 'Independent current owner differs from authorized primary.', 'BLOCKED');
    o.typeInfo = publicType(await read(() => sdk.FServiceAPI.Resource.getResourceTypeInfoByCode({ code: 'RT004005' })));
    assert(envelope(o.typeInfo) && o.typeInfo.data.code === 'RT004005' && o.typeInfo.data.status === 1 && o.typeInfo.data.isTerminate === true
      && [o.typeInfo.data.subjectType].flat().includes(4) && o.typeInfo.data.resourceConfig?.supportOptionalConfig === 2
      && ['display_artist', 'label_name'].every((key) => o.typeInfo.data.attrs?.some((a) => a.key === key)), 'The current platform lacks the required full collection type capability; no resource writes were issued.', 'BLOCKED');
    await readCollectionSystemConfiguration(sdk, read, o);
    const sourceInfo = async (id) => { const response = await read(() => sdk.FServiceAPI.Resource.info({ resourceIdOrName: id, isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 }));
      const projected = managementSdkProjection(response); if (projected.data) projected.data.subjectType = response.data.subjectType ?? null; return projected; };
    for (const kind of ['theme', 'image']) {
      const l = prerequisites[kind], baseline = await sourceInfo(l.source.resourceId);
      assert(envelope(baseline) && baseline.data.resourceId === l.source.resourceId && baseline.data.resourceName === l.source.resourceName && baseline.data.userId === o.currentUser.data.userId
        && baseline.data.status === 4 && typeof baseline.data.latestVersion === 'string' && baseline.data.latestVersion && baseline.data.isFrozen !== true
        && [baseline.data.subjectType].flat().length === 1 && [baseline.data.subjectType].flat()[0] === 1
        && !['feedUrl', 'rssGuid', 'rssPubDate'].some((k) => baseline.data[k]) && baseline.data.policies?.some((p) => p.status === 1), 'The same-run source is not an offline, owned, published, enabled-policy single resource.', 'BLOCKED');
      const knownVersion = await read(() => sdk.FServiceAPI.Resource.resourceVersionInfo1({ resourceId: l.source.resourceId, version: '1.1.0' }));
      assert(envelope(knownVersion) && knownVersion.data.resourceId === l.source.resourceId && knownVersion.data.version === '1.1.0', 'Source lifecycle version disappeared.', 'BLOCKED');
      o.sources.push({ kind, baseline, knownVersion: { ret: knownVersion.ret, errCode: knownVersion.errCode, data: { resourceId: knownVersion.data.resourceId, version: knownVersion.data.version } } });
    }
    validateCollectionLifecycleFiles(o);
    const command = (label) => { const spec = collectionLifecycleCommands(o).find((s) => s.label === label); assert(spec, 'Unknown fixed collection command.'); return spec; };
    const cli = (label, work) => {
      const spec = command(label), startedAt = new Date().toISOString(); let child;
      try { child = spawnSync(process.execPath, [installed.cliBin, ...spec.argv.map((a) => a === '<primary-login>' ? primary.loginName : a)],
        { cwd: work, env, input: label.endsWith('login') ? `${primary.password}\n` : '', encoding: 'utf8', timeout: budget.timeout(90_000), maxBuffer: 4_000_000 }); }
      catch { child = { status: null, signal: null, error: { code: 'SPAWN_FAILED' } }; }
      const action = { label, argv: spec.argv, startedAt, finishedAt: new Date().toISOString(), result: { status: child.status ?? null, signal: child.signal ?? null, error: child.error ? 'CLI did not complete normally.' : null,
        timedOut: child.error?.code === 'ETIMEDOUT', stdout: safe(child.stdout ?? ''), stderr: safe(child.stderr ?? '') } };
      o.actions.push(action); persist();
      const completed = !action.result.error && !action.result.signal && !action.result.timedOut && action.result.stderr === '';
      if (spec.error) assert(completed && child.status === 1 && JSON.parse(action.result.stdout).code === spec.error, 'Readonly resume did not prove missing intent.');
      else if (!completed || child.status !== 0) {
        let code; try { code = JSON.parse(action.result.stdout).code; } catch { /* unknown failures are not classified from text */ }
        throw new HarnessError(code === 'COLLECTION_ITEM_BROWSER_AUTH_REQUIRED' ? 'BLOCKED' : 'FAIL', 'A fixed CLI step failed; no successor write or cleanup was issued.');
      }
      if (label !== 'create') {
        const expected = collectionCommandOutput(o, label); let actual = action.result.stdout;
        if (typeof expected !== 'string') { try { actual = JSON.parse(actual); } catch { actual = null; } }
        assert(equal(actual, expected), 'A completed CLI output differs from the fixed product result; no successor action issued.');
      }
      return action;
    };
    for (const s of o.sources) {
      const work = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-lifecycle-'))); workspaces.push(work); s.cwd = work;
      const artifact = validateRetainedArtifact(prerequisites[s.kind].source.retainedArtifact, { evidenceDir: o.evidenceDir, runId: o.runId });
      cpSync(artifact, path.join(work, s.kind === 'theme' ? 'dist' : 'photo-v2.png'), { recursive: s.kind === 'theme', force: false, errorOnExist: true });
      const login = cli(`${s.kind} login`, work); s.auth = readCollectionLoginSelector(work, o.currentUser.data, login, o);
      cli(`${s.kind} bind`, work); s.identity = readJson(path.join(work, '.freelog/1.json')); cli(`${s.kind} online`, work); s.online = await sourceInfo(s.baseline.data.resourceId);
      assert(equal({ ...s.online, data: { ...s.online.data, status: 4 } }, s.baseline) && s.online.data.status === 1, 'Source shelf change was not exactly confirmed.');
    }
    const work = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-lifecycle-'))); workspaces.push(work); o.cwd = work;
    const login = cli('collection login', work); o.auth = readCollectionLoginSelector(work, o.currentUser.data, login, o);
    cli('create', work); o.collectionIdentity = readJson(path.join(work, '.freelog/1.json')); const id = o.collectionIdentity.resourceId;
    assert(/^[a-f0-9]{24}$/u.test(id ?? '') && o.collectionIdentity.resourceName === `${primary.loginName}/qa-cl-${o.runId.slice(0, 12)}` && o.collectionIdentity.subject === 'collection', 'Created collection identity differs.');
    assert(o.actions.at(-1).result.stdout === `${id}\n`, 'Create stdout differs from the durable identity; no successor action issued.');
    const pages = async (draft) => {
      const result = []; let skip = 0, total;
      do { const response = await read(() => sdk.FServiceAPI.Resource[draft ? 'getCollectionItems_Draft' : 'getCollectionItems']({ resourceId: id, skip, limit: 100, sortField: 'sortId', sortType: 1 }));
        // Preserve the actual page envelope, including rejection; never create ret/errCode.
        result.push(response); assert(envelope(response) && Number.isSafeInteger(response.data.totalItem) && response.data.totalItem >= 0
          && (total === undefined || total === response.data.totalItem) && response.data.skip === skip && response.data.limit === 100 && Array.isArray(response.data.dataList)
          && response.data.dataList.length === Math.min(100, response.data.totalItem - skip), 'Catalogue pagination changed or is incomplete.');
        total = response.data.totalItem; skip += response.data.dataList.length;
      } while (skip < total);
      collectionCataloguePages(result); return result;
    };
    const snapshot = async () => { const info = collectionInfo(await read(() => sdk.FServiceAPI.Resource.info({ resourceIdOrName: id, isLoadLatestVersionInfo: 1 })));
      assert(envelope(info) && info.data.resourceId === id && info.data.userId === o.currentUser.data.userId && info.data.status === 4 && info.data.latestVersion, 'Published collection identity is incomplete.');
      return { info, version: versionObservation(await read(() => sdk.FServiceAPI.Resource.resourceVersionInfo1({ resourceId: id, version: info.data.latestVersion }))), publishedPages: await pages(false), draftPages: await pages(true) }; };
    for (const phase of ['first', 'update']) {
      const stage = { phase, form: collectionLifecycleForm(phase, prerequisites.image.source.resourceId) }; o.stages.push(stage);
      cli(`${phase} pull`, work); stage.exported = readJson(path.join(work, `${phase}-pull.json`));
      const expectedPull = phase === 'first' ? { $schema: 'freelog-cli.collection-form.v1', inputs: ['display_artist', 'label_name', 'lyric_language', 'release_type', 'music_genre', 'release_date'].map((key) => ({ key, value: '' })),
        properties: [], options: [], description: '', display: collectionLifecycleForm('first', '').display, dependencies: [] }
        : collectionLifecycleForm('first', prerequisites.image.source.resourceId);
      assert(equal(stage.exported, expectedPull), 'Pulled complete form differs from the fixed initial or published state; no successor write issued.');
      if (phase === 'first') { cli('items add', work); stage.draftPagesBefore = await pages(true); o.itemIds = collectionCataloguePages(stage.draftPagesBefore).map((i) => i.itemId); }
      else { cli('item rename', work); cli('item move', work); stage.draftPagesBefore = await pages(true); }
      writeFileSync(path.join(work, `${phase}-form.json`), `${JSON.stringify(stage.form, null, 2)}\n`, { flag: 'wx' });
      cli(`${phase} edit`, work); cli(`${phase} show`, work); stage.localBefore = diskState(work, id);
      // Stop before publication if JSON/display/draft did not preserve the complete fixed input.
      assert(equal(JSON.parse(o.actions.at(-1).result.stdout), stage.form) && equal(JSON.parse(stage.localBefore.draft?.utf8).form, stage.form), 'The complete form was not preserved locally.');
      cli(`${phase} publish`, work); stage.localAfter = diskState(work, id); stage.published = await snapshot();
      o.finishedAt = new Date().toISOString(); const checked = evaluateCollectionLifecycleCase(leaf.id, o);
      for (const key of ['full-form-stages', 'catalogue-stages', 'local-state']) { const a = checked.assertions.find((a) => a.id === key);
        assert(equal(a.actual.slice(0, o.stages.length), a.expected.slice(0, o.stages.length)), 'Published complete fields/catalogue/local state differ; successors stopped.'); }
      persist();
    }
    cli('resume absent', work);
    for (const s of o.sources) { const current = await sourceInfo(s.baseline.data.resourceId); assert(equal(current, s.online), 'Source changed before restoration; no further write issued.');
      cli(`${s.kind} restore offline`, s.cwd); s.restored = await sourceInfo(s.baseline.data.resourceId); assert(equal(s.restored, s.baseline), 'Source restoration differs; successors stopped.'); }
    o.finishedAt = new Date().toISOString(); validateCollectionLifecycleFiles(o); const business = evaluateCollectionLifecycleCase(leaf.id, o);
    assert(business.assertions.filter((a) => a.id !== 'owned-cleanup').every((a) => a.passed), 'The full collection business chain did not pass; cleanup was not issued.');
    result = { ...business, status: 'NOT_TESTED', reason: 'Business observations passed; owned logout/cleanup has not completed.' }; persist();
    {
      o.cleanupActions = [];
      for (const directory of workspaces) {
        const original = directory === work ? { auth: o.auth, identity: o.collectionIdentity } : o.sources.find((s) => s.cwd === directory);
        const observation = cleanupCollectionWorkspace(directory, { auth: original.auth, identity: original.identity }, (args) => {
          let child;
          try { child = spawnSync(process.execPath, [installed.cliBin, ...args], { cwd: directory, env, encoding: 'utf8', timeout: budget.timeout(60_000), maxBuffer: 4_000_000 }); }
          catch { child = { status: null, signal: null, error: { code: 'SPAWN_FAILED' } }; }
          return { status: child.status ?? null, signal: child.signal ?? null, error: child.error ? 'CLI did not complete normally.' : null,
            timedOut: child.error?.code === 'ETIMEDOUT', stdout: safe(child.stdout ?? ''), stderr: safe(child.stderr ?? '') };
        }, (entry) => { o.cleanupActions.push(entry); persist(); });
        assert(observation.removed, 'Owned successful workspace was not removed.'); persist();
      }
      o.cleanup = 'Owned successful workspaces removed; collection retained offline and source original shelf restored.';
    }
    o.finishedAt = new Date().toISOString(); validateCollectionLifecycleFiles(o); result = evaluateCollectionLifecycleCase(leaf.id, o);
  } catch (error) { result = { id: leaf.id, status: error instanceof HarnessError ? error.status : 'FAIL', assertions: [],
    reason: error instanceof HarnessError ? safe(error.message) : 'Collection apparatus failed; unknown exception details withheld.', ...(o ? { observations: o } : {}) }; }
  persist();
  if (result.status !== 'PASS' && workspaces.length) console.log(safe(`RETAIN collection workspaces: ${workspaces.join(', ')}; no failure cleanup or successor requests issued.`));
  return { cases: [result], exitCode: result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 1 : 3 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const r = await runCollectionLifecycle(); console.log(JSON.stringify({ producer: leaf.script, cases: r.cases.map(({ id, status }) => ({ id, status })) })); process.exitCode = r.exitCode; }
  catch { console.error('Collection evidence could not be persisted; unknown diagnostics withheld.'); process.exitCode = 1; }
}
