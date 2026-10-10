/** verify-scenarios 共用的 payload 比对（与 src/services/payloadParity.ts 同逻辑） */

export function inputAttrsToMap(attrs) {
  const map = new Map();
  for (const row of attrs || []) {
    if (!row?.key) continue;
    map.set(String(row.key), String(row.value ?? ''));
  }
  return map;
}

export function diffInputAttrsByValue(expected, actual) {
  const expMap = inputAttrsToMap(expected);
  const actMap = inputAttrsToMap(actual);
  const keys = new Set([...expMap.keys(), ...actMap.keys()]);
  const mismatches = [];
  for (const key of [...keys].sort()) {
    const exp = expMap.get(key);
    const act = actMap.get(key);
    if (exp === act) continue;
    mismatches.push({
      key,
      expected: exp ?? '(missing)',
      actual: act ?? '(missing)',
    });
  }
  return mismatches;
}

export function formatAttrDiff(mismatches, max = 5) {
  return mismatches
    .slice(0, max)
    .map((m) => `${m.key}: ${m.expected} → ${m.actual}`)
    .join('; ');
}
