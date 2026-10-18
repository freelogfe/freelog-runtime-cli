import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Source-fixed inputs are substituted only in memory. No report/CLI may supply this contract.
async function contractValidator(rules, caseIds) {
  const location = new URL('../../scripts/release/delivery.mjs', import.meta.url);
  const catalog = caseIds.map((id) => ({ id, kind: 'product-case' }));
  const source = readFileSync(location, 'utf8')
    .replace(/import \{ acceptanceCatalog \} from '[^']+';/u, `const acceptanceCatalog = ${JSON.stringify(catalog)};`)
    .replace(/import \{ deliveryContractSha256, deliveryRules \} from '[^']+';/u,
      `const deliveryRules = ${JSON.stringify(rules)}; const deliveryContractSha256 = () => 'fixture-only';`)
    .replace(/from '(\.[^']+)'/gu, (_, relative) => `from '${new URL(relative, location).href}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { validateContract };\n//# sourceURL=delivery-contract-fixture.mjs`).toString('base64')}`)).validateContract;
}

const rule = (id, caseIds) => ({ id, designPaths: ['docs/design.md'], caseIds });

test('rule IDs are independent of cases; multiple rules may require the same exact leaf case', async () => {
  const validate = await contractValidator([
    rule('RULE.INPUT', ['CASE.REJECT', 'CASE.ACCEPT']),
    rule('RULE.NO_WRITE', ['CASE.REJECT']),
  ], ['CASE.REJECT', 'CASE.ACCEPT']);
  assert.doesNotThrow(validate);
});

test('complete case union does not permit duplicate/empty rules or empty/duplicate case mappings', async () => {
  for (const rules of [
    [], [rule('', ['A'])], [rule('R', ['A']), rule('R', ['A'])],
    [rule('R', [])], [rule('R', ['A', 'A'])], [rule('R', [''])],
  ]) {
    const validate = await contractValidator(rules, ['A']);
    assert.throws(validate, /DELIVERY_CONTRACT_RULES/u, JSON.stringify(rules));
  }
});

test('unmapped business cases and unknown/legacy case references are rejected independently', async () => {
  for (const [rules, cases] of [
    [[rule('R', ['A'])], ['A', 'B']],
    [[rule('R', ['A', 'unknown'])], ['A']],
    [[rule('R', ['LEGACY.verify-commands'])], ['A']],
  ]) {
    const validate = await contractValidator(rules, cases);
    assert.throws(validate, /DELIVERY_CONTRACT_CASES/u);
  }
});
