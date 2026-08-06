/** Console Network ↔ CLI dry-run updateCollection body 比对 */

import { diffInputAttrsByValue } from './payload-parity.mjs';

const IGNORE_KEYS = new Set(['resourceId']);

export function normalizeUpdateCollectionBody(body) {
  if (!body || typeof body !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (IGNORE_KEYS.has(key) || key.startsWith('_')) continue;
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) {
      out[key] = [];
      continue;
    }
    out[key] = value;
  }
  if (!('customPropertyDescriptors' in out)) out.customPropertyDescriptors = [];
  if (!('inputAttrs' in out)) out.inputAttrs = [];
  return out;
}

export function diffUpdateCollectionBodies(expected, actual) {
  const exp = normalizeUpdateCollectionBody(expected);
  const act = normalizeUpdateCollectionBody(actual);
  const mismatches = [];

  const keys = new Set([...Object.keys(exp), ...Object.keys(act)]);
  for (const key of [...keys].sort()) {
    if (key === 'inputAttrs') {
      const attrDiff = diffInputAttrsByValue(exp.inputAttrs, act.inputAttrs);
      for (const row of attrDiff) {
        mismatches.push({ field: `inputAttrs.${row.key}`, expected: row.expected, actual: row.actual });
      }
      continue;
    }
    if (key === 'catalogueProperty') {
      const eJson = JSON.stringify(exp.catalogueProperty ?? null);
      const aJson = JSON.stringify(act.catalogueProperty ?? null);
      if (eJson !== aJson) {
        mismatches.push({ field: key, expected: eJson, actual: aJson });
      }
      continue;
    }
    const e = exp[key];
    const a = act[key];
    if (JSON.stringify(e ?? null) !== JSON.stringify(a ?? null)) {
      mismatches.push({
        field: key,
        expected: JSON.stringify(e ?? null),
        actual: JSON.stringify(a ?? null),
      });
    }
  }
  return mismatches;
}

export function formatUpdateCollectionDiff(mismatches, max = 8) {
  return mismatches
    .slice(0, max)
    .map((m) => `${m.field}: ${m.expected} → ${m.actual}`)
    .join('; ');
}
