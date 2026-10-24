import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acceptanceCatalog, acceptanceScripts, legacyScripts, validateCatalog } from '../acceptance/catalog.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'freelog-catalog-quality-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-catalog-quality-'));
    rmSync(root, { recursive: true, force: true });
  });
  writeFileSync(path.join(root, 'producer.mjs'), '// Synthetic catalog-test producer, never dev evidence.\n');
  const entry = { id: 'SYNTHETIC.FIRST', kind: 'product-case', required: true,
    title: 'Synthetic catalog shape only', assertionIds: ['exact-readback'], script: 'producer.mjs' };
  return { root, entry };
}

test('current catalog has one business kind, seven retained gaps and the approved legacy process list', () => {
  assert.equal(validateCatalog(), acceptanceCatalog);
  assert.equal(acceptanceCatalog.filter((entry) => entry.gap).length, 7);
  assert.ok(acceptanceCatalog.filter((entry) => !entry.id.startsWith('LEGACY.')).every((entry) => entry.kind === 'product-case'));
  assert.deepEqual(acceptanceScripts(), [...legacyScripts, 'verify-command-parameters.mjs', 'verify-account-login.mjs', 'verify-type-init.mjs', 'verify-resource-sync-json.mjs',
    'verify-theme-resource-management.mjs', 'verify-image-resource-management.mjs', 'verify-console-roundtrip.mjs', 'verify-collection-lifecycle.mjs', 'verify-collection-recovery.mjs', 'verify-collection-items.mjs', 'verify-collection-selection.mjs', 'verify-collection-edit.mjs', 'verify-collection-identity.mjs', 'verify-collection-rules.mjs', 'verify-collection-publish-preflight.mjs', 'verify-collection-publish-preview.mjs']);
});

test('empty catalogs, unknown kinds, duplicate IDs, empty or duplicate assertions and nonboolean required are rejected', (t) => {
  const { root, entry } = fixture(t);
  for (const invalid of [[], null, {}]) assert.throws(() => validateCatalog(invalid, root), /catalog is empty or invalid/u);
  for (const patch of [{ kind: 'product-obligation' }, { kind: 'unknown' }, { id: '' }, { title: '' },
    { assertionIds: [] }, { assertionIds: [''] }, { assertionIds: ['same', 'same'] }, { required: 'true' }]) {
    assert.throws(() => validateCatalog([{ ...entry, ...patch }], root), /Malformed\/duplicate acceptance descriptor/u);
  }
  assert.throws(() => validateCatalog([entry, { ...entry }], root), /Malformed\/duplicate acceptance descriptor: SYNTHETIC.FIRST/u);
});

test('closing a gap requires an actual registered producer before a case can be declared implemented', (t) => {
  const { root, entry } = fixture(t);
  const gap = { ...entry, gap: 'Not implemented.' };
  delete gap.script;
  assert.doesNotThrow(() => validateCatalog([gap], root));
  delete gap.gap;
  assert.throws(() => validateCatalog([gap], root), /Missing acceptance producer: SYNTHETIC.FIRST/u);
  assert.throws(() => validateCatalog([{ ...gap, script: 'missing.mjs' }], root), /Missing\/nonregular acceptance producer: SYNTHETIC.FIRST/u);
  assert.doesNotThrow(() => validateCatalog([entry], root));
});

test('producer traversal, absolute paths, directories and junctions are not executable registrations', (t) => {
  const { root, entry } = fixture(t);
  for (const script of ['../producer.mjs', '/producer.mjs', 'C:\\producer.mjs', 'nested/producer.mjs', '', null]) {
    assert.throws(() => validateCatalog([{ ...entry, script }], root), /Invalid acceptance producer/u);
  }
  const directory = path.join(root, 'directory.mjs');
  mkdirSync(directory);
  assert.throws(() => validateCatalog([{ ...entry, script: 'directory.mjs' }], root), /Missing\/nonregular acceptance producer/u);
  // Junction creation is supported on Windows without enabling file-symlink privileges.
  symlinkSync(directory, path.join(root, 'alias.mjs'), 'junction');
  assert.throws(() => validateCatalog([{ ...entry, script: 'alias.mjs' }], root), /Missing\/nonregular acceptance producer/u);
});

test('one business producer runs once for multiple cases and creates no implicit legacy evidence', (t) => {
  const { root, entry } = fixture(t);
  const catalog = [entry, { ...entry, id: 'SYNTHETIC.SECOND' }];
  assert.deepEqual(acceptanceScripts(catalog, root), ['producer.mjs']);
  assert.ok(catalog.every((item) => item.kind === 'product-case'));
  assert.throws(() => validateCatalog([{ ...entry, id: 'LEGACY.producer' }], root), /cannot impersonate legacy/u);
  assert.throws(() => validateCatalog([{ ...entry, kind: 'legacy-suite' }], root), /Invalid legacy acceptance descriptor/u);
});

test('gap is explicit nonempty business metadata, not an alternate validation kind', (t) => {
  const { root, entry } = fixture(t);
  for (const gap of ['', ' ', false, null]) {
    assert.throws(() => validateCatalog([{ ...entry, gap }], root), /Invalid acceptance gap: SYNTHETIC.FIRST/u);
  }
});
