/** Console Network ↔ CLI dry-run createVersion body 比对（归一化后 diff） */

import { diffInputAttrsByValue } from './payload-parity.mjs';

const IGNORE_KEYS = new Set(['resourceId', 'fileSha1', 'filename']);

export function normalizeCreateVersionBody(body) {
  if (!body || typeof body !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (IGNORE_KEYS.has(key)) continue;
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) {
      out[key] = [];
      continue;
    }
    out[key] = value;
  }
  if (!('customPropertyDescriptors' in out)) out.customPropertyDescriptors = [];
  if (!('batchSignContracts' in out)) out.batchSignContracts = undefined;
  return out;
}

export function diffCreateVersionBodies(expected, actual) {
  const exp = normalizeCreateVersionBody(expected);
  const act = normalizeCreateVersionBody(actual);
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
    const e = exp[key];
    const a = act[key];
    const eJson = JSON.stringify(e ?? null);
    const aJson = JSON.stringify(a ?? null);
    if (eJson !== aJson) {
      mismatches.push({ field: key, expected: eJson, actual: aJson });
    }
  }
  return mismatches;
}

export function formatCreateVersionDiff(mismatches, max = 8) {
  return mismatches
    .slice(0, max)
    .map((m) => `${m.field}: ${m.expected} → ${m.actual}`)
    .join('; ');
}
