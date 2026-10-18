import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveCliBin } from '../acceptance/cli-bin.mjs';

test('development mode explicitly resolves workspace dist', () => {
  assert.equal(resolveCliBin('/workspace', {}), path.join('/workspace', 'packages', 'cli', 'dist', 'bin', 'index.js'));
});

test('explicit candidate bin never silently falls back', () => {
  assert.throws(() => resolveCliBin('/workspace', { FREELOG_TEST_CLI_BIN: '' }));
  assert.throws(() => resolveCliBin('/workspace', { FREELOG_TEST_CLI_BIN: 'relative.js' }));
  assert.throws(() => resolveCliBin('/workspace', { FREELOG_TEST_CLI_BIN: path.join(os.tmpdir(), 'missing-candidate.js') }));
  assert.throws(() => resolveCliBin('/workspace', { FREELOG_TEST_CANDIDATE_MODE: '1' }));
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'freelog-bin-quality-'));
  try {
    mkdirSync(path.join(temporary, 'directory'));
    assert.throws(() => resolveCliBin('/workspace', { FREELOG_TEST_CLI_BIN: path.join(temporary, 'directory') }));
    assert.equal(resolveCliBin('/workspace', { FREELOG_TEST_CLI_BIN: process.execPath }), process.execPath);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
