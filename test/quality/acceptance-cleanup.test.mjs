import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanupWorkspace } from '../acceptance/cleanup.mjs';
import { readonlyPropertyReadback } from '../acceptance/readback.mjs';

const makeWorkspace = () => realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-cleanup-quality-')));
const options = { prefixes: ['freelog-cleanup-quality-'], log() {} };

test('failed workspace retains exact draft bytes and cleanup cannot turn its outcome into success', () => {
  const work = makeWorkspace();
  try {
    mkdirSync(path.join(work, '.freelog'));
    const draft = path.join(work, '.freelog', '1.version.json'); writeFileSync(draft, 'original draft');
    assert.deepEqual(cleanupWorkspace(work, { ...options, success: false }), { removed: false, retained: true });
    assert.equal(readFileSync(draft, 'utf8'), 'original draft');
  } finally { rmSync(work, { recursive: true, force: true }); }
});

test('successful owned workspace is removed but unsafe target is rejected', () => {
  const work = makeWorkspace();
  assert.deepEqual(cleanupWorkspace(work, { ...options, success: true }), { removed: true, retained: false });
  assert.equal(existsSync(work), false);
  assert.throws(() => cleanupWorkspace(tmpdir(), { ...options, success: true }), /Refusing cleanup outside/u);
});

test('pending POST, collection intent and transaction prevent deletion even after nominal success', () => {
  for (const relative of ['.freelog/.pending-operation.json', '.freelog/collection-forms/intents/resource.json', '.freelog/.txn.json', '.freelog/.transaction.json']) {
    const work = makeWorkspace();
    try {
      const marker = path.join(work, relative); mkdirSync(path.dirname(marker), { recursive: true }); writeFileSync(marker, 'unknown result');
      assert.throws(() => cleanupWorkspace(work, { ...options, success: true }), /Pending submission evidence/u);
      assert.equal(readFileSync(marker, 'utf8'), 'unknown result');
    } finally { rmSync(work, { recursive: true, force: true }); }
  }
});

test('every legacy temp-workspace producer delegates deletion to the guarded cleanup helper', () => {
  for (const file of ['run-all-scenarios.mjs', 'verify-commands.mjs', 'verify-collection-policy.mjs', 'verify-policy-template-tty.mjs',
    'verify-scenarios.mjs', 'verify-field-rules.mjs', 'dependency-declaration-helpers.mjs', 'run-resource-pool-scenarios.mjs',
    'verify-optional-config.mjs', 'verify-theme-image-full-lifecycle.mjs', 'verify-multi-resource-tty.mjs', 'verify-draft-safety.mjs']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?:\.|\b)rmSync\s*\(/u, file);
    assert.match(source, /cleanupWorkspace\(/u, file);
  }
  for (const file of ['verify-dependency-declarations.mjs', 'verify-collection-dependency-declarations.mjs', 'verify-paid-declaration.mjs']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /cleanupProject\(ctx, source, \{ success: completed \}\)/u, file);
  }
});

test('logout hook cannot introduce pending state and then have it deleted', () => {
  const work = makeWorkspace();
  try {
    assert.throws(() => cleanupWorkspace(work, { ...options, success: true, beforeRemove() {
      mkdirSync(path.join(work, '.freelog')); writeFileSync(path.join(work, '.freelog', '.pending-operation.json'), '{}');
    } }), /Pending evidence appeared/u);
    assert.ok(existsSync(work));
  } finally { rmSync(work, { recursive: true, force: true }); }
});

test('140-char readback requires correct key/type/value and normally completed JSON command', () => {
  const value = '值'.repeat(140);
  const valid = { status: 0, signal: null, stdout: JSON.stringify({ customPropertyDescriptors: [{ key: 'aa3', type: 'readonlyText', defaultValue: value }] }) };
  assert.equal(readonlyPropertyReadback(valid, 'aa3', value), true);
  for (const changed of [{ status: 1 }, { status: null }, { signal: 'SIGTERM' }, { error: new Error('spawn failed') },
    { stdout: JSON.stringify({ customPropertyDescriptors: [{ key: 'other', type: 'readonlyText', defaultValue: value }] }) },
    { stdout: JSON.stringify({ customPropertyDescriptors: [{ key: 'aa3', type: 'editableText', defaultValue: value }] }) },
    { stdout: 'garbage ' + value }, { stdout: JSON.stringify({ customPropertyDescriptors: [{ key: 'aa3', type: 'readonlyText', defaultValue: value.slice(1) }] }) }]) {
    assert.equal(readonlyPropertyReadback({ ...valid, ...changed }, 'aa3', value), false);
  }
});
