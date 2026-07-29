import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePolicyFile } from '../src/services/policyService.js';
import { CliError } from '../src/core/errors.js';

describe('policy.json schema', () => {
  it('accepts single policy object', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-'));
    const file = path.join(dir, 'policy.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ policyName: '免费', policyText: 'for public_users:', status: 1 }),
    );
    const items = parsePolicyFile(file);
    expect(items).toHaveLength(1);
    expect(items[0].policyName).toBe('免费');
  });

  it('rejects short policyName', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-'));
    const file = path.join(dir, 'policy.json');
    fs.writeFileSync(file, JSON.stringify({ policyName: 'a', policyText: 'x' }));
    expect(() => parsePolicyFile(file)).toThrow(CliError);
  });
});
