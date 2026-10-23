/** Selection-only additions; existing C09 and explicit-C03 route predicates stay unchanged. */
import { itemRouteAllowed } from './collection-items-control.mjs';
export function selectionRouteAllowed(method, raw) {
  if (itemRouteAllowed(method, raw)) return true;
  if (method !== 'GET' || typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\p{Cc}\p{Cf}\\]/u.test(raw)) return false;
  const u = new URL(raw, 'https://api.devfreelog.com');
  if (u.origin !== 'https://api.devfreelog.com' || u.hash) return false;
  let rules;
  if (u.pathname === '/v2/resources') rules = { skip: (v) => v === '0' || v === '50' || v === '100', limit: (v) => v === '50',
    isSelf: (v) => v === '1', subjectType: (v) => v === '1', keywords: (v) => v === 'needle' || /^range_\d{3}$/u.test(v) && Number(v.slice(-3)) <= 100,
    resourceType: (v) => v === '素材', resourceTypeCode: (v) => v === 'IMAGE', resourceTypeCategory: (v) => v === '2' };
  else if (u.pathname === '/v2/resources/types/listSimpleByGroup') rules = { category: (v) => v === '1', status: (v) => v === '1', subjectType: (v) => v === '1' };
  if (!rules) return false;
  return [...u.searchParams].every(([k, v]) => Object.hasOwn(rules, k) && u.searchParams.getAll(k).length === 1 && rules[k](v));
}
