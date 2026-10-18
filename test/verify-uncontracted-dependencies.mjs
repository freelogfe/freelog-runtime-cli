#!/usr/bin/env node
/**
 * Bounded dev experiment: can unpublished, newly-created licensees submit
 * dependencies without any pre-existing contract, and without backend auto-sign?
 *
 * Scope guard:
 * - creates isolated dev resource/collection shells only;
 * - never calls CLI dependency commands, contract lifecycle APIs, or shelf APIs;
 * - keeps workspaces and JSON report under OS temp/freelog-runtime-cli-verification/.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveCliBin } from './acceptance/cli-bin.mjs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { FServiceAPI, FUtil } from '../packages/tools-lib/dist/node.mjs';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const cliBin = resolveCliBin(repoRoot);
const envIndex = process.argv.indexOf('--env');
const env = envIndex >= 0 ? process.argv[envIndex + 1] ?? 'dev' : 'dev';
const API = 'https://api.devfreelog.com';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const evidenceRoot = path.join(tmpdir(), 'freelog-runtime-cli-verification', 'unsigned-dependencies', runId);
const reportPath = path.join(evidenceRoot, 'report.json');
const lines = [];
const report = {
  schemaVersion: 1,
  env,
  runId,
  startedAt: new Date().toISOString(),
  scope: {
    devOnly: true,
    noOnline: true,
    noPolicyCreation: true,
    noPayment: true,
    noCliDependencyCommands: true,
    noExplicitSigning: true,
    postUnknownRule: 'readback-only; never auto-retry the same version/update write',
  },
  sources: [],
  targetSelection: {
    selected: [],
    missingCategories: [],
    rejectedPoolItems: [],
  },
  cases: [],
  summary: {
    accepted: 0,
    rejected: 0,
    unknown: 0,
    skippedExistingContract: 0,
    setupFailed: 0,
    positiveControl: { accepted: 0, rejected: 0, unknown: 0, notNeeded: 0 },
  },
};

class BlockedError extends Error {}

function log(line) {
  console.log(line);
  lines.push(line);
}

function blocked(message) {
  throw new BlockedError(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function dataOf(value) {
  return value?.data ?? value;
}

function redact(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (/password|cookie|token|authorization/i.test(key)) return '<redacted>';
    if (typeof item === 'string') {
      return item
        .replace(/(password|token|cookie|authorization)=([^\s|&]+)/gi, '$1=<redacted>')
        .replace(/(Bearer\s+)[^\s|]+/gi, '$1<redacted>');
    }
    return item;
  }));
}

function errorEvidence(error) {
  const raw = error && typeof error === 'object' ? error : {};
  const response = raw.response && typeof raw.response === 'object' ? raw.response : {};
  let parsedMessage;
  if (typeof raw.message === 'string') {
    try {
      parsedMessage = JSON.parse(raw.message);
    } catch {
      parsedMessage = raw.message.slice(0, 500);
    }
  }
  return redact({
    name: raw.name,
    code: raw.code ?? raw.errCode ?? response.data?.code ?? parsedMessage?.code,
    message: response.data?.msg ?? response.data?.message ?? raw.msg ?? parsedMessage?.msg ?? parsedMessage?.message ?? parsedMessage,
    status: response.status ?? raw.status ?? parsedMessage?.status,
    data: response.data,
  });
}

function listFromEnvelope(value) {
  const data = dataOf(value);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.dataList)) return data.dataList;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.items)) return data.items;
  throw new Error('Unexpected list response shape.');
}

function firstFile(dir) {
  for (const entry of readdirSync(dir)) {
    const candidate = path.join(dir, entry);
    if (statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`No file in ${dir}`);
}

function copyDirectoryContents(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) {
    cpSync(path.join(source, entry), path.join(destination, entry), { recursive: true });
  }
}

function writeUniquePng(destination) {
  const width = 67;
  const height = 43;
  const stamp = Date.now();
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const start = row * (width * 3 + 1);
    for (let column = 0; column < width; column += 1) {
      const pixel = start + 1 + column * 3;
      raw[pixel] = (stamp + row + column) & 255;
      raw[pixel + 1] = ((stamp >>> 8) + row * 3) & 255;
      raw[pixel + 2] = ((stamp >>> 16) + column * 5) & 255;
    }
  }
  writeFileSync(destination, Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function pngChunk(type, payload) {
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write(type, 4, 'ascii');
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + payload.length)), 8 + payload.length);
  return chunk;
}

function crc32(input) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function withTimeout(label, promise, ms = 45_000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function apiRead(label, fn, ms = 45_000) {
  return withTimeout(label, fn(), ms);
}

async function apiWriteOnce(label, fn, ms = 45_000) {
  return withTimeout(label, fn(), ms);
}

async function loginForApi(primary) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${API}/v2/passport/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginName: primary.loginName, password: primary.password, isRemember: 1 }),
      signal: controller.signal,
    });
    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [response.headers.get('set-cookie')].filter(Boolean);
    const cookie = setCookies.map((item) => item.split(';')[0]).join('; ');
    if ((response.status !== 200 && response.status !== 302) || !cookie) throw new Error(`API login failed HTTP ${response.status}`);
    FUtil.configurePlatform({
      getEnv: () => 'dev',
      getHeaders: async () => ({ cookie }),
    });
    log('[api] login ok cookie=received');
  } finally {
    clearTimeout(timer);
  }
}

function runCli(label, args, { cwd, input } = {}) {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd: cwd ?? repoRoot,
    input,
    encoding: 'utf8',
    timeout: label === 'login' ? 15_000 : 180_000,
  });
  const out = (result.stdout ?? '').trim();
  const err = (result.stderr ?? '').trim();
  const ok = result.status === 0;
  log(`${ok ? 'PASS' : 'FAIL'} ${label} exit=${result.status}`);
  if (!ok) {
    if (out) log(`  stdout: ${String(redact(out)).slice(0, 800).replaceAll('\n', ' | ')}`);
    if (err) log(`  stderr: ${String(redact(err)).slice(0, 800).replaceAll('\n', ' | ')}`);
  }
  return { ok, status: result.status, out, err };
}

function requireCli(result, message) {
  if (!result.ok) throw new Error(message);
}

function sourceOwner(resourceName) {
  return typeof resourceName === 'string' && resourceName.includes('/') ? resourceName.split('/')[0] : '';
}

function policyKind(name) {
  const text = String(name ?? '');
  if (text.includes('付费')) return 'paid';
  if (text.includes('等待免费')) return 'waiting-free';
  if (text.includes('免费')) return 'free';
  return 'other';
}

async function resourceInfo(resourceIdOrName) {
  return dataOf(await apiRead(`Resource.info ${resourceIdOrName}`, () => FServiceAPI.Resource.info({
    resourceIdOrName,
    isLoadLatestVersionInfo: 1,
    isLoadPolicyInfo: 1,
    isTranslate: 1,
  })));
}

async function versionInfo(resourceId, version) {
  return dataOf(await apiRead(`Resource.resourceVersionInfo1 ${resourceId} ${version}`, () => FServiceAPI.Resource.resourceVersionInfo1({
    resourceId,
    version,
  })));
}

async function contractsFor(licenseeId, licenseeIdentityType, subjectId) {
  const list = listFromEnvelope(await apiRead(`Contract.batchContracts ${licenseeId} -> ${subjectId}`, () => FServiceAPI.Contract.batchContracts({
    subjectIds: subjectId,
    subjectType: 1,
    licenseeId,
    licenseeIdentityType,
    isLoadPolicyInfo: 1,
    isTranslate: 1,
  })));
  for (const [index, contract] of list.entries()) {
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)
      || typeof contract.contractId !== 'string' || !contract.contractId.trim()
      || contract.licenseeId !== licenseeId
      || Number(contract.licenseeIdentityType) !== licenseeIdentityType
      || contract.subjectId !== subjectId || Number(contract.subjectType) !== 1) {
      throw new Error(`Contract row ${index} malformed or outside requested parties; cannot prove zero contracts.`);
    }
  }
  return list.map((contract) => redact({
    contractId: contract.contractId,
    status: contract.status,
    contractStatus: contract.contractStatus,
    authStatus: contract.authStatus,
    policyId: contract.policyId ?? contract.policyInfo?.policyId,
    subjectId: contract.subjectId,
    licenseeId: contract.licenseeId,
    licenseeIdentityType: contract.licenseeIdentityType,
  }));
}

function normalizeDeps(dependencies) {
  if (!Array.isArray(dependencies)) return [];
  return dependencies.map((item) => ({
    resourceId: String(item.resourceId ?? ''),
    versionRange: String(item.versionRange ?? ''),
  })).filter((item) => item.resourceId);
}

function depsEqual(actual, expected) {
  return JSON.stringify(normalizeDeps(actual)) === JSON.stringify(normalizeDeps(expected));
}

function singleVersionPayload(source, version, dependencies) {
  const draft = source.draft;
  const payload = {
    resourceId: source.resourceId,
    version,
    fileSha1: draft.fileSha1,
    filename: draft.filename,
    description: `${source.kind} unsigned dependency experiment ${version}`,
    customPropertyDescriptors: draft.customPropertyDescriptors ?? [],
    dependencies,
    inputAttrs: draft.inputAttrs ?? [],
    baseUpcastResources: [],
    authExcludedItems: [],
  };
  if ('batchSignContracts' in payload) throw new Error('forbidden signing field must not be present');
  return payload;
}

function collectionPayload(source, description, dependencies) {
  const payload = {
    resourceId: source.resourceId,
    inputAttrs: [],
    customPropertyDescriptors: [],
    description,
    catalogueProperty: {
      collection_sort_list: 'collection_sort_ascending',
      collection_item_title: 'collection_item_title_rtitle',
      collection_item_no_display: 'collection_item_no_display_show',
      collection_item_image_display: 'collection_item_image_display_show',
      collection_item_descr_display: 'collection_item_descr_display_show',
      collection_view: 'collection_view_list',
    },
    dependencies,
    baseUpcastResources: [],
    authExcludedItems: [],
    isMergeCatalogueDraft: 0,
  };
  if ('batchSignContracts' in payload) throw new Error('forbidden signing field must not be present');
  return payload;
}

async function createSingleSource(spec, primary) {
  const work = path.join(evidenceRoot, 'work', spec.kind);
  mkdirSync(work, { recursive: true });
  const envArgs = ['--env', env];
  const stamp = `${Date.now().toString(36)}-${spec.kind}`;
  requireCli(runCli('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...envArgs], {
    cwd: work,
    input: `${primary.password}\n`,
  }), `${spec.kind} login failed`);
  if (spec.kind === 'theme') {
    requireCli(runCli('init theme', ['init', 'theme', '.', '--template', 'vite-react-ts', '--yes', ...envArgs], { cwd: work }), 'theme init failed');
    const dist = path.join(work, 'dist');
    copyDirectoryContents(path.join(testRoot, 'fixtures', 'theme-artifact'), dist);
    writeFileSync(firstFile(dist), `\n<!-- unsigned-dep ${stamp} -->\n`, { flag: 'a' });
  } else {
    if (spec.kind === 'image') writeUniquePng(path.join(work, spec.artifact));
    else cpSync(spec.fixture, path.join(work, spec.artifact));
    requireCli(runCli(`init ${spec.typeCode}`, ['init', '.', '--type', spec.typeCode, '--artifact', spec.artifact, '--yes', ...envArgs], { cwd: work }), `${spec.kind} init failed`);
  }
  requireCli(runCli(`create ${spec.typeCode}`, [
    'create',
    '--title', `unsigned-${spec.kind}-${stamp}`,
    '--type', spec.typeCode,
    '--name', `unsigned-${spec.kind}-${stamp}`,
    '--artifact', spec.artifact,
    '--yes',
    ...envArgs,
  ], { cwd: work }), `${spec.kind} create failed`);
  requireCli(runCli(`prepare ${spec.typeCode}`, ['create-version', '--prepare', '--yes', ...envArgs], { cwd: work }), `${spec.kind} prepare failed`);
  const identity = readJson(path.join(work, '.freelog', '1.json'));
  const draft = readJson(path.join(work, '.freelog', '1.version.json'));
  if (!identity.resourceId || !draft.fileSha1 || !draft.filename) throw new Error(`${spec.kind} source missing resourceId/fileSha1`);
  const info = await resourceInfo(identity.resourceId);
  const resourceName = typeof info.resourceName === 'string' && info.resourceName ? info.resourceName : identity.resourceName;
  runCli('logout', ['logout', '--yes', ...envArgs], { cwd: work });
  const source = {
    kind: spec.kind,
    subject: 'resource',
    licenseeIdentityType: 1,
    typeCode: spec.typeCode,
    work,
    resourceId: identity.resourceId,
    resourceName,
    owner: sourceOwner(resourceName),
    latestBefore: info.latestVersion ?? null,
    draft: {
      fileSha1: draft.fileSha1,
      filename: draft.filename,
      customPropertyDescriptors: draft.customPropertyDescriptors ?? [],
      inputAttrs: draft.inputAttrs ?? [],
    },
    nextPatch: 0,
    firstDependencyAttempted: false,
    setupUsable: true,
  };
  report.sources.push(redact({ ...source, draft: { ...source.draft, fileSha1: `${source.draft.fileSha1.slice(0, 8)}...` } }));
  return source;
}

async function createCollectionSource(primary) {
  const work = path.join(evidenceRoot, 'work', 'collection');
  mkdirSync(work, { recursive: true });
  const envArgs = ['--env', env];
  const stamp = `${Date.now().toString(36)}-collection`;
  requireCli(runCli('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...envArgs], {
    cwd: work,
    input: `${primary.password}\n`,
  }), 'collection login failed');
  requireCli(runCli('collection create', [
    'collection',
    'create',
    '--type', 'RT003011',
    '--title', `unsigned-collection-${stamp}`,
    '--name', `unsigned-collection-${stamp}`,
    '--yes',
    ...envArgs,
  ], { cwd: work }), 'collection create failed');
  const identity = readJson(path.join(work, '.freelog', '1.json'));
  if (!identity.resourceId) throw new Error('collection source missing resourceId');
  const info = await resourceInfo(identity.resourceId);
  const resourceName = typeof info.resourceName === 'string' && info.resourceName ? info.resourceName : identity.resourceName;
  runCli('logout', ['logout', '--yes', ...envArgs], { cwd: work });
  const source = {
    kind: 'collection',
    subject: 'collection',
    licenseeIdentityType: 4,
    typeCode: 'RT003011',
    work,
    resourceId: identity.resourceId,
    resourceName,
    owner: sourceOwner(resourceName),
    latestBefore: info.latestVersion ?? null,
    latest: typeof info.latestVersion === 'string' ? info.latestVersion : undefined,
    updateIndex: 0,
    firstDependencyAttempted: false,
    setupUsable: true,
  };
  report.sources.push(redact(source));
  return source;
}

async function createSources(primary) {
  const singleSpecs = [
    {
      kind: 'theme',
      typeCode: 'RT001',
      artifact: 'dist',
      fixture: null,
    },
    {
      kind: 'image',
      typeCode: 'RT005001',
      artifact: 'sample-image.png',
      fixture: path.join(testRoot, 'fixtures', 'media', 'sample-image.png'),
    },
    {
      kind: 'video',
      typeCode: 'RT006003',
      artifact: 'sample-video.mp4',
      fixture: path.join(testRoot, 'fixtures', 'media', 'sample-video.mp4'),
    },
  ];
  const sources = [];
  for (const spec of singleSpecs) sources.push(await createSingleSource(spec, primary));
  sources.push(await createCollectionSource(primary));
  return sources;
}

async function validatePoolTargets(pool, owner) {
  const candidates = [];
  for (const item of pool.resources ?? []) {
    if (!item?.resourceId || !item?.policyId) continue;
    try {
      const info = await resourceInfo(item.resourceId);
      const subjectTypes = Array.isArray(info.subjectType) ? info.subjectType : [info.subjectType];
      const policies = Array.isArray(info.policies) ? info.policies : [];
      const matchingPolicy = policies.find((policy) => policy.policyId === item.policyId && Number(policy.status) === 1);
      if (!subjectTypes.some((value) => Number(value) === 1) || Number(info.status) !== 1 || !info.latestVersion || !matchingPolicy) {
        report.targetSelection.rejectedPoolItems.push({
          resourceId: item.resourceId,
          resourceName: item.resourceName,
          reason: 'not status=1 subjectType=1 with latest and active policy',
          status: info.status,
          subjectType: info.subjectType,
          latestVersion: info.latestVersion ?? null,
        });
        continue;
      }
      const targetOwner = sourceOwner(info.resourceName ?? item.resourceName);
      const kind = policyKind(item.policyName ?? matchingPolicy.policyName);
      candidates.push({
        resourceId: item.resourceId,
        resourceName: info.resourceName ?? item.resourceName,
        resourceTitle: info.resourceTitle ?? item.resourceTitle,
        resourceTypeCode: item.resourceTypeCode,
        policyId: item.policyId,
        policyName: item.policyName ?? matchingPolicy.policyName,
        policyKind: kind,
        owner: targetOwner,
        ownerRelation: targetOwner === owner ? 'self' : 'other',
        latestVersion: String(info.latestVersion),
        versionRange: `^${info.latestVersion}`,
      });
    } catch (error) {
      report.targetSelection.rejectedPoolItems.push({
        resourceId: item.resourceId,
        resourceName: item.resourceName,
        reason: 'info lookup failed',
        error: errorEvidence(error),
      });
    }
  }

  const selected = [];
  const add = (predicate) => {
    const found = candidates.find((item) => !selected.some((chosen) => chosen.resourceId === item.resourceId) && predicate(item));
    if (found) selected.push(found);
    return found;
  };

  if (!add((item) => item.ownerRelation === 'self' && item.policyKind === 'free')) report.targetSelection.missingCategories.push('self-free');
  if (!add((item) => item.ownerRelation === 'self' && item.policyKind === 'paid')) report.targetSelection.missingCategories.push('self-paid');
  if (!add((item) => item.ownerRelation === 'other' && item.policyKind === 'waiting-free')) report.targetSelection.missingCategories.push('other-waiting-free');

  const usedOwners = new Set(selected.map((item) => item.owner));
  const usedTypes = new Set(selected.map((item) => item.resourceTypeCode));
  while (selected.length < 6) {
    const found = candidates.find((item) => {
      if (selected.some((chosen) => chosen.resourceId === item.resourceId)) return false;
      if (item.ownerRelation !== 'other' || item.policyKind !== 'free') return false;
      return !usedOwners.has(item.owner) || !usedTypes.has(item.resourceTypeCode) || selected.length >= 4;
    }) ?? candidates.find((item) => (
      !selected.some((chosen) => chosen.resourceId === item.resourceId)
      && (item.policyKind === 'free' || item.policyKind === 'waiting-free')
    ));
    if (!found) break;
    selected.push(found);
    usedOwners.add(found.owner);
    usedTypes.add(found.resourceTypeCode);
  }

  if (selected.length < 4) blocked(`Only ${selected.length} valid targets found; need at least 4.`);
  report.targetSelection.selected = selected;
  return selected;
}

async function attemptSingle(source, dependencies, version, target, role) {
  const payload = singleVersionPayload(source, version, dependencies);
  try {
    await apiWriteOnce(`Resource.createVersion ${source.resourceId} ${version}`, () => FServiceAPI.Resource.createVersion(payload));
    return { write: 'success', payload: redact(payload) };
  } catch (error) {
    return { write: 'error', error: errorEvidence(error), payload: redact(payload) };
  }
}

async function attemptCollection(source, dependencies, target, role) {
  const description = `${source.kind} unsigned dependency experiment ${String(source.updateIndex).padStart(2, '0')} ${role}`;
  const payload = collectionPayload(source, description, dependencies);
  try {
    await apiWriteOnce(`Resource.updateCollection ${source.resourceId}`, () => FServiceAPI.Resource.updateCollection(payload));
    return { write: 'success', payload: redact(payload) };
  } catch (error) {
    return { write: 'error', error: errorEvidence(error), payload: redact(payload) };
  }
}

async function readbackAfter(source, expectedVersion, expectedDependencies) {
  const info = await resourceInfo(source.resourceId);
  const latest = typeof info.latestVersion === 'string' ? info.latestVersion : null;
  const version = expectedVersion ?? latest;
  let versionReadback = null;
  let readError = null;
  if (version) {
    try {
      const versionData = await versionInfo(source.resourceId, version);
      versionReadback = {
        version,
        dependencies: normalizeDeps(versionData.dependencies),
        description: versionData.description ?? null,
        filename: versionData.filename ?? null,
      };
    } catch (error) {
      readError = errorEvidence(error);
    }
  }
  const matched = versionReadback ? depsEqual(versionReadback.dependencies, expectedDependencies) : false;
  return {
    latest,
    expectedVersion: version,
    readback: versionReadback,
    readError,
    dependencyReadbackMatched: matched,
  };
}

async function positiveControlIfNeeded(source, rejectedCase, version) {
  const control = {
    role: 'positive-control-no-dependencies',
    sourceKind: source.kind,
    sourceId: source.resourceId,
    licenseeIdentityType: source.licenseeIdentityType,
    versionOrUpdate: version ?? null,
    expected: 'setup should accept identical legal payload after removing only dependencies',
    dependencies: [],
  };
  const result = source.subject === 'collection'
    ? await attemptCollection(source, [], undefined, 'positive-control')
    : await attemptSingle(source, [], version, undefined, 'positive-control');
  Object.assign(control, result);
  const after = await readbackAfter(source, source.subject === 'collection' ? undefined : version, []);
  control.after = after;
  control.contractNote = 'No dependency target; no contract query applies.';
  if (result.write === 'success' && after.dependencyReadbackMatched) {
    control.actual = 'accepted';
    report.summary.positiveControl.accepted += 1;
    if (source.subject === 'collection') {
      source.latest = after.latest ?? source.latest;
      source.updateIndex += 1;
    }
  } else if (result.write === 'error') {
    control.actual = 'rejected';
    report.summary.positiveControl.rejected += 1;
  } else {
    control.actual = 'unknown';
    report.summary.positiveControl.unknown += 1;
  }
  report.cases.push(control);
  if (control.actual !== 'accepted') source.setupUsable = false;
  return control;
}

async function runDependencyCase(source, target, role) {
  const dependencies = [{ resourceId: target.resourceId, versionRange: target.versionRange }];
  const version = source.subject === 'collection' ? undefined : `1.0.${source.nextPatch}`;
  const caseRecord = {
    role,
    sourceKind: source.kind,
    sourceId: source.resourceId,
    sourceResourceName: source.resourceName,
    sourceTypeCode: source.typeCode,
    licenseeIdentityType: source.licenseeIdentityType,
    target: redact(target),
    versionOrUpdate: version ?? `collection-update-${source.updateIndex}`,
    expected: 'experiment unknown: whether platform accepts dependency declaration without a contract',
    dependencies,
  };

  const before = await contractsFor(source.resourceId, source.licenseeIdentityType, target.resourceId);
  caseRecord.contractsBefore = before;
  if (before.length > 0) {
    caseRecord.actual = 'skipped-existing-contract';
    caseRecord.reason = 'precondition failed: ANY contract already existed for exact parties before write';
    report.summary.skippedExistingContract += 1;
    report.cases.push(caseRecord);
    return;
  }

  const result = source.subject === 'collection'
    ? await attemptCollection(source, dependencies, target, role)
    : await attemptSingle(source, dependencies, version, target, role);
  Object.assign(caseRecord, result);

  const afterReadback = await readbackAfter(source, source.subject === 'collection' ? undefined : version, dependencies);
  const afterContracts = await contractsFor(source.resourceId, source.licenseeIdentityType, target.resourceId);
  caseRecord.after = afterReadback;
  caseRecord.contractsAfter = afterContracts;
  caseRecord.provesNoBackendAutoSign = afterContracts.length === 0;

  if (result.write === 'success' && afterReadback.dependencyReadbackMatched && afterContracts.length === 0) {
    caseRecord.actual = 'accepted';
    report.summary.accepted += 1;
    if (source.subject === 'resource') source.nextPatch += 1;
    else {
      source.latest = afterReadback.latest ?? source.latest;
      source.updateIndex += 1;
    }
  } else if (result.write === 'error') {
    caseRecord.actual = 'rejected';
    report.summary.rejected += 1;
    if (!source.firstDependencyAttempted) {
      caseRecord.positiveControlTriggered = true;
    }
  } else {
    caseRecord.actual = 'unknown';
    report.summary.unknown += 1;
  }

  const wasFirst = !source.firstDependencyAttempted;
  source.firstDependencyAttempted = true;
  report.cases.push(caseRecord);
  if (wasFirst && caseRecord.actual === 'rejected') {
    await positiveControlIfNeeded(source, caseRecord, version);
    if (source.subject === 'resource' && source.setupUsable) source.nextPatch += 1;
  } else if (wasFirst) {
    report.summary.positiveControl.notNeeded += 1;
  }
}

async function runCombinedCase(source, targets) {
  if (!source.setupUsable) {
    report.cases.push({
      role: 'combined-all-targets',
      sourceKind: source.kind,
      sourceId: source.resourceId,
      actual: 'setup-failed',
      reason: 'source positive control did not pass; combined write skipped',
    });
    report.summary.setupFailed += 1;
    return;
  }
  const cleanTargets = [];
  const beforeContracts = [];
  for (const target of targets) {
    const before = await contractsFor(source.resourceId, source.licenseeIdentityType, target.resourceId);
    beforeContracts.push({ target: target.resourceId, contracts: before });
    if (before.length === 0) cleanTargets.push(target);
  }
  const dependencies = cleanTargets.map((target) => ({ resourceId: target.resourceId, versionRange: target.versionRange }));
  if (dependencies.length === 0) {
    report.cases.push({
      role: 'combined-all-targets',
      sourceKind: source.kind,
      sourceId: source.resourceId,
      actual: 'skipped-existing-contract',
      reason: 'all selected targets had an existing contract by combined phase',
      beforeContracts,
    });
    report.summary.skippedExistingContract += 1;
    return;
  }
  const version = source.subject === 'collection' ? undefined : `1.0.${source.nextPatch}`;
  const caseRecord = {
    role: 'combined-all-targets',
    sourceKind: source.kind,
    sourceId: source.resourceId,
    sourceResourceName: source.resourceName,
    sourceTypeCode: source.typeCode,
    licenseeIdentityType: source.licenseeIdentityType,
    targets: cleanTargets.map(redact),
    skippedTargetsWithExistingContracts: beforeContracts.filter((item) => item.contracts.length > 0),
    versionOrUpdate: version ?? `collection-update-${source.updateIndex}`,
    expected: 'experiment unknown: whether platform accepts multiple dependency declarations without contracts',
    dependencies,
  };
  const result = source.subject === 'collection'
    ? await attemptCollection(source, dependencies, undefined, 'combined-all-targets')
    : await attemptSingle(source, dependencies, version, undefined, 'combined-all-targets');
  Object.assign(caseRecord, result);
  const afterReadback = await readbackAfter(source, source.subject === 'collection' ? undefined : version, dependencies);
  const afterContracts = [];
  for (const target of cleanTargets) {
    afterContracts.push({ target: target.resourceId, contracts: await contractsFor(source.resourceId, source.licenseeIdentityType, target.resourceId) });
  }
  caseRecord.after = afterReadback;
  caseRecord.contractsAfter = afterContracts;
  caseRecord.provesNoBackendAutoSign = afterContracts.every((item) => item.contracts.length === 0);
  if (result.write === 'success' && afterReadback.dependencyReadbackMatched && caseRecord.provesNoBackendAutoSign) {
    caseRecord.actual = 'accepted';
    report.summary.accepted += 1;
    if (source.subject === 'resource') source.nextPatch += 1;
    else {
      source.latest = afterReadback.latest ?? source.latest;
      source.updateIndex += 1;
    }
  } else if (result.write === 'error') {
    caseRecord.actual = 'rejected';
    report.summary.rejected += 1;
  } else {
    caseRecord.actual = 'unknown';
    report.summary.unknown += 1;
  }
  report.cases.push(caseRecord);
}

async function main() {
  if (env !== 'dev') blocked('This experiment is dev-only; use --env dev.');
  if (!existsSync(cliBin)) blocked('Missing CLI dist/bin/index.js. Build was expected to be present before this experiment.');
  mkdirSync(evidenceRoot, { recursive: true });
  const credentials = readJson(path.join(testRoot, '.freelog-test-credentials.local.json'));
  const primary = credentials.primary;
  if (!primary?.loginName || !primary?.password) blocked('Missing primary dev credentials.');
  const pool = readJson(path.join(testRoot, '.freelog-test-resource-pool.local.json'));
  await loginForApi(primary);

  log(`report=${reportPath}`);
  const sources = await createSources(primary);
  const owner = sources.find((source) => source.owner)?.owner;
  const targets = await validatePoolTargets(pool, owner);
  log(`selected targets=${targets.length}`);

  for (const source of sources) {
    log(`\n=== source ${source.kind} ${source.resourceId} ===`);
    for (const target of targets) {
      if (!source.setupUsable) break;
      await runDependencyCase(source, target, 'single-target');
    }
    await runCombinedCase(source, targets);
  }
}

try {
  await main();
  if (report.summary.rejected || report.summary.unknown || report.summary.setupFailed) {
    throw new Error(`Unsigned declaration experiment incomplete: ${JSON.stringify(report.summary)}`);
  }
  if (report.summary.skippedExistingContract || report.summary.accepted === 0) {
    blocked('Existing contracts or absent accepted cases prevent an unsigned declaration conclusion.');
  }
  report.result = 'passed';
  report.finishedAt = new Date().toISOString();
  report.log = lines;
  writeFileSync(reportPath, `${JSON.stringify(redact(report), null, 2)}\n`, 'utf8');
  log(`DONE report=${reportPath}`);
} catch (error) {
  mkdirSync(evidenceRoot, { recursive: true });
  report.finishedAt = new Date().toISOString();
  report.result = error instanceof BlockedError ? 'blocked' : 'failed';
  report.error = errorEvidence(error);
  report.log = lines;
  writeFileSync(reportPath, `${JSON.stringify(redact(report), null, 2)}\n`, 'utf8');
  console.error(`${report.result.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`report=${reportPath}`);
  process.exit(error instanceof BlockedError ? 3 : 1);
}
