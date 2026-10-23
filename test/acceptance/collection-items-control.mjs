/** A distinct fixed route family. Does not broaden the C09 recovery predicate. */
const draft = '/v2/resources/catalogues/drafts/local_collection/items';
const sourceId = (value) => /^source_(image|theme|other|range_\d{3})$/u.test(value) && (!value.includes('range_') || Number(value.slice(-3)) <= 100);
export function itemRouteAllowed(method, raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\p{Cc}\p{Cf}\\]/u.test(raw)) return false;
  const url = new URL(raw, 'https://api.devfreelog.com');
  if (url.origin !== 'https://api.devfreelog.com' || url.hash) return false;
  if (method === 'POST') return url.pathname === draft && !url.search;
  if (method !== 'GET') return false;
  let allowed;
  const one = (v) => v === '1';
  if (url.pathname === '/v2/resources/local_collection') allowed = { isLoadLatestVersionInfo: one, isLoadPolicyInfo: one };
  else if (sourceId(url.pathname.slice('/v2/resources/'.length)) && url.pathname.startsWith('/v2/resources/')
    || url.pathname === '/v2/resources/alice%2Fimage') allowed = { isLoadLatestVersionInfo: one };
  else if (url.pathname === '/v2/resources/catalogue/local_collection/items/collectRules') allowed = {};
  else if (url.pathname === draft) allowed = { skip: (v) => v === '0' || v === '100', limit: (v) => v === '100', sortField: (v) => v === 'sortId', sortType: one, isLoadLatestVersionInfo: one };
  else if (url.pathname === `${draft}/checkExists`) allowed = { resourceIds: (v) => v.split(',').every(sourceId) && v.length < 3000 };
  else if (url.pathname === `${draft}/batchAuth`) allowed = { itemIds: (v) => v.length < 100 && v.split(',').every((id) => /^item_(image|theme|range_000|range_100)$/u.test(id)) };
  else if (url.pathname === '/v2/contracts/list') allowed = { subjectIds: (v) => v === 'upstream_image', subjectType: one,
    licenseeId: (v) => v === 'local_collection', licenseeIdentityType: (v) => v === '4', isLoadPolicyInfo: one };
  if (allowed === undefined) return false;
  return [...url.searchParams].every(([key, value]) => Object.hasOwn(allowed, key) && url.searchParams.getAll(key).length === 1 && allowed[key](value));
}
