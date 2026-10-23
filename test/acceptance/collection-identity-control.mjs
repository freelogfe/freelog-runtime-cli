/** C01-only SDK routes. No item mutation, payment, signing or real transport is admitted. */
export function identityRouteAllowed(method, raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\p{Cc}\p{Cf}\\]/u.test(raw)) return false;
  const u = new URL(raw, 'https://api.devfreelog.com');
  if (u.origin !== 'https://api.devfreelog.com' || u.hash) return false;
  if (method === 'POST') return u.pathname === '/v2/resources' && u.search === '';
  if (method !== 'GET') return false;
  const exact = (values) => {
    const keys = Object.keys(values);
    return [...u.searchParams].length === keys.length && keys.every((key) => u.searchParams.getAll(key).length === 1 && String(values[key]) === u.searchParams.get(key));
  };
  if (u.pathname === '/v2/resources/types/listSimpleByGroup') return exact({ category: 1, status: 1, subjectType: 4 });
  if (u.pathname === '/v2/resources/types/getInfoByCode') return exact({ code: 'CT001' });
  if (u.pathname === '/v2/resources/types/listSimpleByParentCode') return exact({ category: 1, nameChain: 'leaf', isTerminate: true, status: 1, subjectType: 4 });
  if (u.pathname === '/v2/resources') return ['0', '100'].includes(u.searchParams.get('skip'))
    && exact({ skip: u.searchParams.get('skip'), limit: 100, isSelf: 1, subjectType: 4 });
  const resource = u.pathname.slice('/v2/resources/'.length);
  if (u.pathname.startsWith('/v2/resources/') && /^(local_collection|other_collection|created_collection|alice%2F(?:collection|new_collection)|owned_(?:0\d\d|100))$/u.test(resource)) {
    return exact({ isLoadLatestVersionInfo: 1 }) || exact({ isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 });
  }
  return /^\/v2\/resources\/catalogue\/(local_collection|owned_(?:0\d\d|100))\/items\/collectRules$/u.test(u.pathname) && u.search === '';
}
