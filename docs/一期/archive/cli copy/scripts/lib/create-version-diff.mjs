/** Console Network ↔ CLI dry-run createVersion body 比对（归一化后 diff） */

import { diffInputAttrsByValue } from './payload-parity.mjs';

const IGNORE_KEYS = new Set(['resourceId', 'fileSha1', 'filename', 'description', 'version']);
const URL_VALUE_KEYS = new Set(['videoCover']);

function valuesEqualForField(key, expected, actual) {
  if (URL_VALUE_KEYS.has(key)) {
    const expOk = expected == null || (typeof expected === 'string' && expected.startsWith('http'));
    const actOk = actual == null || (typeof actual === 'string' && actual.startsWith('http'));
    if (expOk && actOk) {
      if (expected == null && actual == null) return true;
      if (expected != null && actual != null) return true;
    }
    return false;
  }
  return JSON.stringify(expected ?? null) === JSON.stringify(actual ?? null);
}

export function normalizeCreateVersionBody(body) {
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
    if (!valuesEqualForField(key, e, a)) {
      mismatches.push({
        field: key,
        expected: JSON.stringify(e ?? null),
        actual: JSON.stringify(a ?? null),
      });
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
