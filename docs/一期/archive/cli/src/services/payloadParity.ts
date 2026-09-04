import type { CustomPropertyDescriptor } from '../config/project.js';

export type InputAttrRow = { key: string; value: string };

export function inputAttrsToMap(
  attrs?: Array<{ key?: string; value?: unknown }> | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of attrs || []) {
    if (!row?.key) continue;
    map.set(String(row.key), String(row.value ?? ''));
  }
  return map;
}

/** inputAttrs value 级 diff；返回不一致项列表 */
export function diffInputAttrsByValue(
  expected: Array<{ key?: string; value?: unknown }> | undefined,
  actual: Array<{ key?: string; value?: unknown }> | undefined,
): Array<{ key: string; expected: string; actual: string }> {
  const expMap = inputAttrsToMap(expected);
  const actMap = inputAttrsToMap(actual);
  const keys = new Set([...expMap.keys(), ...actMap.keys()]);
  const mismatches: Array<{ key: string; expected: string; actual: string }> = [];

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

function normalizeCustomDescriptor(desc: CustomPropertyDescriptor) {
  return {
    key: desc.key,
    type: desc.type,
    name: desc.name || desc.key,
    defaultValue: String(desc.defaultValue ?? ''),
    remark: desc.remark ?? '',
    candidateItems: [...(desc.candidateItems || [])].map(String).sort(),
  };
}

/** customPropertyDescriptors 结构 + defaultValue diff */
export function diffCustomPropertyDescriptors(
  expected: CustomPropertyDescriptor[] | undefined,
  actual: CustomPropertyDescriptor[] | undefined,
): Array<{ key: string; field: string; expected: string; actual: string }> {
  const expMap = new Map(
    (expected || [])
      .filter((d) => d?.key)
      .map((d) => [d.key, normalizeCustomDescriptor(d)] as const),
  );
  const actMap = new Map(
    (actual || [])
      .filter((d) => d?.key)
      .map((d) => [d.key, normalizeCustomDescriptor(d)] as const),
  );
  const keys = new Set([...expMap.keys(), ...actMap.keys()]);
  const mismatches: Array<{ key: string; field: string; expected: string; actual: string }> = [];

  for (const key of [...keys].sort()) {
    const exp = expMap.get(key);
    const act = actMap.get(key);
    if (!exp || !act) {
      mismatches.push({
        key,
        field: 'descriptor',
        expected: exp ? 'present' : '(missing)',
        actual: act ? 'present' : '(missing)',
      });
      continue;
    }
    for (const field of ['type', 'defaultValue', 'name', 'remark'] as const) {
      if (exp[field] !== act[field]) {
        mismatches.push({ key, field, expected: exp[field], actual: act[field] });
      }
    }
    const expItems = exp.candidateItems.join(',');
    const actItems = act.candidateItems.join(',');
    if (expItems !== actItems) {
      mismatches.push({
        key,
        field: 'candidateItems',
        expected: expItems || '(empty)',
        actual: actItems || '(empty)',
      });
    }
  }
  return mismatches;
}

/** createVersion 请求体比对（忽略 undefined 字段） */
export function pickCreateVersionComparableFields(params: Record<string, unknown>) {
  const keys = [
    'resourceId',
    'version',
    'fileSha1',
    'filename',
    'description',
    'videoCover',
    'inputAttrs',
    'customPropertyDescriptors',
    'dependencies',
    'baseUpcastResources',
    'authExcludedItems',
  ] as const;

  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (params[key] !== undefined) picked[key] = params[key];
  }
  return picked;
}
