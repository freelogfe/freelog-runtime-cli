import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePolicyMapFile } from '../src/services/depAuthService.js';
import { CliError } from '../src/core/errors.js';
import { fingerprintCollectionDraft } from '../src/adapters/collectionVersionDraftAdapter.js';

describe('parsePolicyMapFile', () => {
  it('accepts yaml and json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authmap-'));
    const yml = path.join(dir, 'a.yaml');
    fs.writeFileSync(
      yml,
      `contracts:\n  - resourceId: r1\n    policyIds: [p1]\n`,
    );
    expect(parsePolicyMapFile(yml).contracts).toHaveLength(1);

    const json = path.join(dir, 'a.json');
    fs.writeFileSync(
      json,
      JSON.stringify({ contracts: [{ resourceId: 'r2', policyIds: ['p2'] }] }),
    );
    expect(parsePolicyMapFile(json).contracts[0].resourceId).toBe('r2');
  });

  it('rejects empty contracts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authmap-'));
    const f = path.join(dir, 'bad.yaml');
    fs.writeFileSync(f, `contracts: []\n`);
    expect(() => parsePolicyMapFile(f)).toThrow(CliError);
  });
});

describe('collection draft fingerprint', () => {
  it('stable for same content', () => {
    const a = fingerprintCollectionDraft({
      versionInput: '1.0.0',
      descriptionEditorInput: 'x',
      additionalProperties: [
        { key: 'b', value: '2' },
        { key: 'a', value: '1' },
      ],
    });
    const b = fingerprintCollectionDraft({
      versionInput: '1.0.0',
      descriptionEditorInput: 'x',
      additionalProperties: [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ],
    });
    expect(a).toBe(b);
  });
});
