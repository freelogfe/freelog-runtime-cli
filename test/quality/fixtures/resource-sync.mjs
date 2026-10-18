/** Synthetic quality-only data; never imported by the real-dev producer. */
import { createHash } from 'node:crypto';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const resourceSyncOriginals = ['a', 'b'].map((prefix, index) => ({ stateFile: `${index + 1}.json`, identity: {
  schemaVersion: 1, subject: 'resource', resourceId: prefix.repeat(24), resourceName: `synthetic/r${index + 1}`, name: `r${index + 1}`,
  typeCode: 'RT005001', filePath: index ? 'sync-b.png' : 'sync-a.png', title: `线上标题${index + 1}`, env: 'dev',
} }));
export const resourceSyncSdk = resourceSyncOriginals.map(({ identity }) => ({ kind: 'response', requestedId: identity.resourceId,
  envelope: { ret: 0, errCode: 0, dataShape: 'object', data: { resourceId: identity.resourceId, userId: 42, resourceTitle: identity.title, status: 0 } } }));
function file(name, text, keepText = false) {
  return { path: name, kind: 'file', size: Buffer.byteLength(text), sha256: hash(text), ...(keepText ? { utf8: text } : {}) };
}
export function resourceSyncSnapshot(identities) {
  return [{ path: '.freelog', kind: 'directory' }, file('.freelog/auth', 'synthetic selector'), file('.freelog/.sequence', '2\n'),
    ...identities.map((identity, index) => file(`.freelog/${index + 1}.json`, `${JSON.stringify(identity, null, 2)}\n`, true)),
    file('.freelog/sync-sentinel.txt', 'keep exact bytes\n'), { path: 'keep-empty', kind: 'directory' }, file('sync-a.png', 'synthetic PNG A'), file('sync-b.png', 'synthetic PNG B')]
    .sort((a, b) => a.path.localeCompare(b.path));
}
export function resourceSyncFixture(stage) {
  const failed = stage === 'ALL_SUCCESS' ? [] : stage === 'PARTIAL_FAILURE' ? [1] : [0, 1];
  const probes = failed.map((index) => ({ stateFile: `${index + 1}.json`, resourceId: String(index + 1).repeat(24),
    lookup: { kind: 'request-failed', requestedId: String(index + 1).repeat(24), httpStatus: 404 } }));
  const before = resourceSyncOriginals.map(({ identity }, index) => ({ ...identity,
    resourceId: probes.find((item) => item.stateFile === `${index + 1}.json`)?.resourceId ?? identity.resourceId,
    title: `qa-sync-stale-${stage}-${index + 1}` }));
  const after = before.map((identity, index) => failed.includes(index) ? identity : { ...identity, title: resourceSyncSdk[index].envelope.data.resourceTitle });
  const dto = { schemaVersion: 1, env: 'dev', summary: { total: 2, succeeded: 2 - failed.length, failed: failed.length },
    results: before.map((identity, index) => ({ stateFile: `${index + 1}.json`, resourceId: identity.resourceId,
      ...(failed.includes(index) ? { status: 'failed', error: { code: 'RESOURCE_SYNC_REQUEST_FAILED', message: '请求失败' } }
        : { status: 'synced', title: resourceSyncSdk[index].envelope.data.resourceTitle }) })) };
  return { cliBin: '/synthetic-installed/node_modules/@freelog-cli/cli2/dist/bin/index.js', auth: { env: 'dev', userId: 42 },
    setupActions: [
      { label: 'login', argv: ['login', '--login-name', '<primary-login>', '--password-stdin', '--yes', '--env', 'dev'] },
      { label: 'init', argv: ['init', '.', '--type', 'RT005001', '--artifact', 'sync-a.png', '--yes', '--env', 'dev'] },
      ...resourceSyncOriginals.map(({ identity }, index) => ({ label: `create ${index + 1}`, argv: ['create', '--title', identity.title,
        '--name', identity.name, '--type', 'RT005001', '--artifact', identity.filePath, '--yes', '--env', 'dev'], stdout: `${identity.resourceId}\n` })),
    ].map(({ stdout = 'synthetic setup output', ...action }) => ({ ...action, result: { status: 0, signal: null,
      error: null, timedOut: false, stderr: '', stdout } })),
    originals: structuredClone(resourceSyncOriginals), originalSdk: structuredClone(resourceSyncSdk),
    remoteBefore: structuredClone(resourceSyncSdk), remoteAfter: structuredClone(resourceSyncSdk), probes,
    before: resourceSyncSnapshot(before), after: resourceSyncSnapshot(after), argv: ['resource', 'sync', '--json', '--env', 'dev'], stdin: '',
    result: { status: failed.length ? 1 : 0, signal: null, error: null, timedOut: false, stdout: `${JSON.stringify(dto)}\n`, stderr: '' } };
}
