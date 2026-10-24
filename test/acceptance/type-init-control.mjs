/** S03 read-only SDK routes. Existing collection route predicates remain unchanged. */
const codes = new Set(['VIDEO', 'PARENT', 'OFF', 'MISSING', 'RT001']);
export function typeInitRouteAllowed(method, raw) {
  if (method !== 'GET' || typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\p{Cc}\p{Cf}\\]/u.test(raw)) return false;
  const url = new URL(raw, 'https://api.devfreelog.com');
  if (url.origin !== 'https://api.devfreelog.com' || url.hash) return false;
  const exact = (values) => [...url.searchParams].length === Object.keys(values).length
    && Object.entries(values).every(([key, value]) => url.searchParams.getAll(key).length === 1 && url.searchParams.get(key) === String(value));
  if (url.pathname === '/v2/resources/types/listSimpleByGroup') return exact({ category: 1, status: 1, subjectType: 1 });
  if (url.pathname === '/v2/resources/types/getInfoByCode') return codes.has(url.searchParams.get('code')) && exact({ code: url.searchParams.get('code') });
  return url.pathname === '/v2/resources/types/listSimpleByParentCode' && ['', '视频', 'leaf'].includes(url.searchParams.get('nameChain'))
    && exact({ category: 1, nameChain: url.searchParams.get('nameChain'), isTerminate: true, status: 1, subjectType: 1 });
}
