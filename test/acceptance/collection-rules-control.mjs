/** C05-only route family. Nothing is forwarded to a platform host. */
export function rulesRouteAllowed(method, raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\p{Cc}\p{Cf}\\]/u.test(raw)) return false;
  const url = new URL(raw, 'https://api.devfreelog.com');
  if (url.origin !== 'https://api.devfreelog.com' || url.hash) return false;
  const exact = values => [...url.searchParams].length === Object.keys(values).length
    && Object.entries(values).every(([key, value]) => url.searchParams.getAll(key).length === 1 && url.searchParams.get(key) === String(value));
  const base = '/v2/resources/catalogue/local_collection/items';
  if (method === 'POST') return url.pathname === `${base}/collectRules` && exact({});
  if (method !== 'GET') return false;
  if (url.pathname === '/v2/resources/local_collection') return exact({ isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 });
  if (url.pathname === `${base}/collectRules`) return exact({});
  if (url.pathname === '/v2/resources/types/getInfoByCode') return exact({ code: 'RT003011' });
  return [base, '/v2/resources/catalogues/drafts/local_collection/items'].includes(url.pathname)
    && ['0', '100'].includes(url.searchParams.get('skip'))
    && exact({ skip: url.searchParams.get('skip'), limit: 100, sortField: 'sortId', sortType: 1 });
}
