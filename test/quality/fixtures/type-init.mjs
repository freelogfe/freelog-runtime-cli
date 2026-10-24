/** Synthetic validator fixtures only; fabricated processes never approve installed CLI behavior. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { typeInitNames, typeInitTtyNames, typeInitInitialEntries, typeInitAfterEntries, typeInitCommand, typeInitSteps,
  typeInitExpectedRequests, typeInitExpectedError, typeInitExpectedOutput, typeInitCapabilityCommand, typeInitJson, typeInitHash } from '../../acceptance/type-init-evidence.mjs';
const stamp = new Date(Date.now() - 60_000).toISOString();
const wireRequests = name => typeInitExpectedRequests(name).map(({ method, path: route, query, body, response }) => ({ method, path: `${route}?${new URLSearchParams(query)}`, body, response }));
export function typeInitFixtureTrace(requests, authenticated = true) {
  return [{ event: 'keyring-replaced' }, { event: 'ready', guard: 'type-init-local-v1' },
    ...Array.from({ length: authenticated ? 1 + requests.length * 2 : 0 }, () => ({ event: 'keyring-get' })),
    ...requests.map(({ method, path: route }) => ({ event: 'request', method, path: route })), { event: 'finished' }]
    .map(event => JSON.stringify({ schemaVersion: 1, ...event })).join('\n') + '\n';
}
export function typeInitFixture(root) {
  const cwd = path.join(tmpdir(), 'synthetic-s03-capability'), controls = `${cwd}-controls`;
  const capability = { name: 'capability', cwd, controls, childPid: 101, argv: typeInitCapabilityCommand(), startedAt: stamp, finishedAt: stamp,
    before: typeInitInitialEntries('capability'), after: typeInitInitialEntries('capability'), homeBefore: [], homeAfter: [], requests: [], trace: typeInitFixtureTrace([], false),
    result: { status: 0, signal: null, stderr: '', stdout: '{"stdin":true,"stdout":true}\r\n', completed: true, completedSteps: 1, matchedPrompts: ['{"stdin":true,"stdout":true}'] } };
  const scenarios = typeInitNames.map((name, index) => {
    const scene = { name, cwd: path.join(tmpdir(), `synthetic-s03-${name}`), controls: path.join(tmpdir(), `synthetic-s03-control-${name}`), childPid: 102 + index,
      tty: typeInitTtyNames.has(name), argv: typeInitCommand(name), steps: typeInitSteps(name), startedAt: stamp, finishedAt: stamp,
      before: typeInitInitialEntries(name), after: typeInitAfterEntries(name), homeBefore: [], homeAfter: [], requests: wireRequests(name), apparatusErrors: [] };
    const error = typeInitExpectedError(name, scene.cwd);
    let stdout = error ? JSON.stringify(error) + '\n' : typeInitExpectedOutput(name);
    if (scene.tty) {
      if (name === 'tty-pages') {
        const page1 = '第 1/2 页，共 51 个可用最终叶子类型\n' + Array.from({ length: 50 }, (_, i) => `TYPE_${i + 1}\t祖父节点 / 父节点 / 叶子${i + 1}\n`).join('');
        stdout = page1 + '资源类型列表\n第 2/2 页，共 51 个可用最终叶子类型\nTYPE_51\t祖父节点 / 父节点 / 叶子51\n资源类型列表\n' + page1 + '资源类型列表\n';
      } else stdout = scene.steps.map(step => `${step.expect}\n`).join('') + stdout;
    }
    scene.result = { status: error ? 1 : 0, signal: null, stdout, stderr: '', ...(scene.tty
      ? { completed: true, completedSteps: scene.steps.length, matchedPrompts: scene.steps.map(step => step.expect) } : { error: null, timedOut: false }) };
    scene.trace = typeInitFixtureTrace(scene.requests);
    return scene;
  });
  const observed = { packageName: '@freelog-cli/cli2', version: '0.5.8', cliBin: path.join(tmpdir(), 'synthetic-s03/node_modules/@freelog-cli/cli2/dist/bin/index.js'),
    binSha256: 'a'.repeat(64), runId: 'synthetic-s03-oracle-only', evidenceDir: path.join(tmpdir(), 'synthetic-s03-evidence'), platform: process.platform,
    nodeVersion: 'v22.18.0', startedAt: stamp, finishedAt: stamp, apparatusErrors: [], capability, scenarios };
  if (root !== undefined) {
    observed.evidenceDir = root;
    observed.cliBin = path.join(root, 'node_modules/@freelog-cli/cli2/dist/bin/index.js');
    mkdirSync(path.dirname(observed.cliBin), { recursive: true });
    const bin = '// synthetic validator fixture, never an executable candidate\n';
    writeFileSync(observed.cliBin, bin); observed.binSha256 = typeInitHash(bin);
    for (const scene of [observed.capability, ...observed.scenarios]) {
      const bytes = typeInitJson(scene), file = path.join(root, 'synthetic.type-init.' + scene.name + '.json');
      writeFileSync(file, bytes, { flag: 'wx' });
      scene.evidenceRef = { path: file, sha256: typeInitHash(bytes) };
    }
  }
  return observed;
}
