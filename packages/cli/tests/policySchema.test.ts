import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPolicyUpdatePayload,
  parsePolicyFile,
  assertPolicySyntaxForAppend,
  assertNewPoliciesUnique,
} from '../src/services/policyService.js';
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

  it('builds addPolicies payload with exactly-once encoded text', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-'));
    const file = path.join(dir, 'policy.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        policyName: '免费',
        policyText: 'for public_users:',
        status: 1,
      }),
    );

    const items = parsePolicyFile(file);
    expect(buildPolicyUpdatePayload(items)).toEqual({
      addPolicies: [
        {
          policyName: '免费',
          policyText: 'for%20public_users%3A',
          status: 1,
        },
      ],
    });
  });

  it('rejects policyId because apply creates policies and set changes status', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-'));
    const file = path.join(dir, 'policy.json');
    fs.writeFileSync(file, JSON.stringify({ policyId: 'policy-1', status: 1 }));

    expect(() => parsePolicyFile(file)).toThrow(CliError);
  });

  it('assertPolicySyntaxForAppend rejects legacy syntax when policies exist', () => {
    expect(() =>
      assertPolicySyntaxForAppend(
        [{ policyName: '备用', policyText: 'for public\nterminate', status: 1 }],
        1,
      ),
    ).toThrow(CliError);
  });

  it('assertPolicySyntaxForAppend allows FOR PUBLIC when appending', () => {
    expect(() =>
      assertPolicySyntaxForAppend(
        [
          {
            policyName: '备用',
            policyText: '\nFOR PUBLIC\n\nInitial:\n\tterminate',
            status: 1,
          },
        ],
        1,
      ),
    ).not.toThrow();
  });

  it('assertPolicySyntaxForAppend skips first policy', () => {
    expect(() =>
      assertPolicySyntaxForAppend(
        [{ policyName: '免费', policyText: 'for public\nterminate', status: 1 }],
        0,
      ),
    ).not.toThrow();
  });

  it('assertNewPoliciesUnique rejects duplicate names', () => {
    expect(() =>
      assertNewPoliciesUnique([{ policyName: '免费', policyText: 'a' }], [
        { policyName: '免费', policyText: 'b', status: 1 },
      ]),
    ).toThrow(CliError);
  });
});
