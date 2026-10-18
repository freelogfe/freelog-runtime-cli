import { matchesCommandResult } from './protocol.mjs';

/** Exact field lookup after normal CLI completion; other keys or text snippets cannot satisfy it. */
export function readonlyPropertyReadback(result, key, expectedValue) {
  if (!matchesCommandResult(result)) return false;
  try {
    const value = JSON.parse(String(result.stdout ?? '').trim());
    if (!Array.isArray(value?.customPropertyDescriptors)) return false;
    const matches = value.customPropertyDescriptors.filter((item) => item?.key === key);
    return matches.length === 1 && matches[0].type === 'readonlyText' && matches[0].defaultValue === expectedValue;
  } catch { return false; }
}
