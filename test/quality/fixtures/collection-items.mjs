/** Synthetic validator controls only, never real installed-package or approval evidence. */
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { itemScenarioNames, itemFixture, itemCommand, itemInitialEntries, itemExpectedRequests, itemExpectedResult, itemHash } from '../../acceptance/collection-items-evidence.mjs';

export function syntheticCollectionItems(root = process.cwd(), materialize = false) {
  const start = new Date(Date.now() - 2000).toISOString(), finish = new Date(Date.now() - 1000).toISOString();
  const observed = { runId: 'synthetic-validator-only', evidenceDir: root, cliBin: path.join(root, 'node_modules/@freelog-cli/cli2/dist/bin/index.js'),
    packageName: '@freelog-cli/cli2', version: '0.5.8', binSha256: 'a'.repeat(64), platform: process.platform,
    nodeVersion: process.version, startedAt: start, finishedAt: finish, apparatusErrors: [], scenarios: [] };
  if (materialize) {
    mkdirSync(path.dirname(observed.cliBin), { recursive: true });
    const bin = '// Non-executable synthetic identity, not installed CLI approval.\n';
    writeFileSync(observed.cliBin, bin); observed.binSha256 = itemHash(bin);
  }
  for (const name of itemScenarioNames) {
    const f = itemFixture(name), requests = itemExpectedRequests(name);
    const o = { name, argv: itemCommand(name), startedAt: start, finishedAt: finish, childPid: 123,
      result: { ...itemExpectedResult(name), signal: null, error: null, timedOut: false, stderr: '' },
      before: itemInitialEntries(), after: itemInitialEntries(), requests,
      remoteBefore: { draft: f.initial, published: f.published }, remoteAfter: { draft: f.writes ? f.final : f.initial, published: f.published },
      trace: [{ schemaVersion: 1, event: 'keyring-replaced' }, { schemaVersion: 1, event: 'ready', guard: 'collection-items-local-v1' },
        ...requests.map(({ method, path }) => ({ schemaVersion: 1, event: 'request', method, path })), { schemaVersion: 1, event: 'finished' }].map(JSON.stringify).join('\n') + '\n',
      apparatusErrors: [] };
    if (materialize) {
      const file = path.join(root, `synthetic.${name}.json`), bytes = `${JSON.stringify(o)}\n`;
      writeFileSync(file, bytes, { flag: 'wx' }); o.evidenceRef = { path: file, sha256: itemHash(bytes) };
    }
    observed.scenarios.push(o);
  }
  return observed;
}
