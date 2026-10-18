/** Synthetic checker controls only; no dev producer imports this fixture. */
import { createHash } from 'node:crypto';
import { consoleRoundtripFixture } from './console-roundtrip.mjs';
import { consoleSdkObservation } from '../../acceptance/console-roundtrip-evidence.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => structuredClone(value);
const file = (path, text, identity = false) => ({ path, kind: 'file', size: Buffer.byteLength(text), sha256: hash(text), ...(identity ? { utf8: text } : {}) });
export function managementSnapshot(identity, kind) {
  return [{ path: '.freelog', kind: 'directory' }, file('.freelog/1.json', `${JSON.stringify(identity)}\n`, true),
    file('.freelog/.sequence', '1\n'), file('.freelog/auth', 'SYNTHETIC NONSECRET AUTH SELECTOR'),
    file('cover.png', 'synthetic cover'), file('sentinel.txt', 'must remain unchanged'),
    ...(kind === 'theme' ? [{ path: 'dist', kind: 'directory' }, file('dist/index.html', 'synthetic theme')] : [file('photo-v2.png', 'synthetic PNG')])]
    .sort((a, b) => a.path.localeCompare(b.path));
}
export async function managementFixture(kind = 'theme') {
  const base = await consoleRoundtripFixture(kind);
  const source = JSON.parse(base.prerequisite.rawText).observations;
  const initial = { resourceId: source.resourceId, resourceName: source.resourceName, userId: 12345,
    resourceTypeCode: source.typeCode, resourceType: null, resourceTitle: `qa-synthetic-${kind}`, intro: '', tags: [],
    coverImages: ['https://image.freelog.cn/synthetic-before.png'], status: 4, isFrozen: null, latestVersion: '1.1.0',
    feedUrl: null, rssGuid: null, rssPubDate: null, policies: [{ policyId: 'c'.repeat(24), policyName: 'Synthetic free', status: 1, policyText: 'synthetic policy' }] };
  const identity = { schemaVersion: 1, subject: 'resource', env: 'dev', resourceId: source.resourceId,
    resourceName: source.resourceName, name: source.resourceName.split('/')[1], title: initial.resourceTitle,
    typeCode: source.typeCode, filePath: kind === 'theme' ? 'dist' : 'photo-v2.png' };
  const observed = { runId: base.runId, evidenceDir: base.evidenceDir, cliBin: base.cliBin, binSha256: base.binSha256,
    resourceKind: kind, resourceId: source.resourceId, prerequisite: base.prerequisite,
    currentUser: base.ownerIdentity.currentUser, auth: { env: 'dev', userId: 12345, username: 'freelog-synthetic' },
    baseline: { ret: 0, errCode: 0, data: initial }, baselineVersions: source.versions.map(consoleSdkObservation),
    setupActions: [], boundIdentity: identity, boundSnapshot: managementSnapshot(identity, kind),
    boundRemote: { ret: 0, errCode: 0, data: clone(initial) }, steps: [] };
  const env = ['--env', 'dev'];
  const suffix = ['--resource', 'file:1.json', '--json', ...env];
  const good = (stdout = '') => ({ status: 0, signal: null, error: null, timedOut: false, stdout, stderr: '' });
  for (const [label, argv] of [
    ['login', ['login', '--login-name', '<primary-login>', '--password-stdin', '--yes', ...env]],
    ['bind', ['bind', source.resourceId, '--artifact', identity.filePath, '--yes', ...env]],
    ['bind repeated', ['bind', source.resourceId, '--artifact', identity.filePath, '--yes', ...env]],
  ]) observed.setupActions.push({ label, argv, result: good(label === 'login' ? 'Synthetic login\n' : 'bind 成功，可用 status 查看\n') });
  observed.repeatBindBefore = clone(observed.boundSnapshot); observed.repeatBindAfter = clone(observed.boundSnapshot);
  observed.cliAuth = { schemaVersion: 1, ...observed.auth };
  const artifactName = kind === 'theme' ? 'dist/index.html' : 'photo-v2.png';
  const artifactEntry = observed.boundSnapshot.find((e) => e.path === artifactName);
  source.retainedArtifact.manifest = [{ path: kind === 'theme' ? 'index.html' : '.', ...(kind === 'theme' ? { kind: 'file' } : {}),
    size: artifactEntry.size, sha256: artifactEntry.sha256 }];
  const raw = JSON.parse(base.prerequisite.rawText); raw.observations = source;
  observed.prerequisite.rawText = `${JSON.stringify(raw)}\n`;
  observed.prerequisite.rawSha256 = hash(observed.prerequisite.rawText);
  observed.prerequisite.suiteCase.evidenceRef.sha256 = observed.prerequisite.rawSha256;
  const commands = [
    ['reject empty', ['update', '--yes', ...suffix], 'UPDATE_NO_FLAGS', '请提供修改字段；交互编辑请在终端执行不带 --yes 的 update'],
    ['reject invalid tags', ['update', '--cover', 'cover.png', '--tags', 'dup,dup', '--yes', ...suffix], 'UPDATE_TAG_DUPLICATE', '该标签已添加'],
    ['reject unconfirmed', ['update', '--intro', 'unconfirmed', ...suffix], 'FORM_NEED_YES', '请加 --yes 确认预览'],
    ['update full', ['update', '--title', `管理验收-${kind}`, '--intro', '管理验收简介', '--tags', '#验收,管理', '--yes', ...suffix]],
    ['update repeated', ['update', '--title', `管理验收-${kind}`, '--intro', '管理验收简介', '--tags', '#验收,管理', '--yes', ...suffix]],
    ['update intro', ['update', '--intro', '只修改简介', '--yes', ...suffix]],
    ['update clear', ['update', '--intro', '', '--tags', '', '--yes', ...suffix]],
    ['update cover', ['update', '--cover', 'cover.png', '--yes', ...suffix]],
    ['validate', ['validate', '--for', 'online', '--resource', 'file:1.json', ...env]],
    ['online', ['online', '--yes', ...suffix]], ['online repeated', ['online', '--yes', ...suffix]],
    ['offline', ['offline', '--yes', ...suffix]], ['offline repeated', ['offline', '--yes', ...suffix]],
  ];
  let remote = clone(initial), local = clone(observed.boundSnapshot);
  for (const [label, argv, errorCode, message] of commands) {
    const step = { label, argv, before: clone(local), remoteBefore: { ret: 0, errCode: 0, data: clone(remote) },
      versionsBefore: clone(observed.baselineVersions) };
    if (label === 'update full') { remote.resourceTitle = `管理验收-${kind}`; remote.intro = '管理验收简介'; remote.tags = ['验收', '管理']; local = managementSnapshot({ ...identity, title: remote.resourceTitle }, kind); }
    if (label === 'update intro') remote.intro = '只修改简介';
    if (label === 'update clear') { remote.intro = ''; remote.tags = []; }
    if (label === 'update cover') remote.coverImages = ['https://image.freelog.cn/synthetic-uploaded.png'];
    if (label === 'online' || label === 'online repeated') remote.status = 1;
    if (label === 'offline' || label === 'offline repeated') remote.status = 4;
    const listing = { resourceName: remote.resourceName, title: remote.resourceTitle, intro: remote.intro, tags: remote.tags, coverImages: remote.coverImages, status: remote.status };
    step.result = errorCode ? { ...good(JSON.stringify({ code: errorCode, message })), status: 1 }
      : good(label === 'validate' ? '可以上架\n' : JSON.stringify(label.startsWith('update')
        ? { resourceId: source.resourceId, changed: label !== 'update repeated', listing }
        : { resourceId: source.resourceId, status: remote.status, changed: !label.endsWith(' repeated') }));
    step.after = clone(local); step.remoteAfter = { ret: 0, errCode: 0, data: clone(remote) }; step.versionsAfter = clone(observed.baselineVersions);
    observed.steps.push(step);
  }
  return observed;
}
