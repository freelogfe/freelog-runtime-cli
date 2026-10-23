/** Fixed local recovery apparatus contract. No production CLI dependency or real credentials. */
import { appendFileSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const recoveryResource = 'local_collection';
export const recoveryHost = 'api.devfreelog.com';
export const recoveryKey = 'v1/dev/7';
export const recoveryFaultExit = 86;

function regular(file) {
  return typeof file === 'string' && path.isAbsolute(file) && path.resolve(file) === file
    && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && realpathSync(file) === file;
}
/** Fail before CLI loading; parser errors must not echo potentially modified control bytes. */
export function loadRecoveryControl() {
  try {
    const file = process.env.FREELOG_TEST_RECOVERY_CONTROL;
    if (!regular(file)) throw new Error();
    const config = JSON.parse(readFileSync(file, 'utf8'));
    if (!config || Array.isArray(config) || Object.keys(config).sort().join(',') !== 'cwd,fault,port,trace'
      || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535
      || !['none', 'prepared', 'sending', 'cleanup'].includes(config.fault)) throw new Error();
    const temporary = realpathSync(tmpdir());
    const controls = path.dirname(file);
    if (path.dirname(controls) !== temporary || !path.basename(controls).startsWith('freelog-collection-recovery-controls-')
      || realpathSync(controls) !== controls || !regular(config.trace) || path.dirname(config.trace) !== controls
      || typeof config.cwd !== 'string' || !path.isAbsolute(config.cwd) || realpathSync(config.cwd) !== config.cwd
      || path.dirname(config.cwd) !== temporary || !path.basename(config.cwd).startsWith('freelog-collection-recovery-work-')) throw new Error();
    return config;
  } catch { throw new Error('Invalid owned local recovery control; CLI execution forbidden.'); }
}

export function recoveryTrace(config, event) {
  appendFileSync(config.trace, `${JSON.stringify({ schemaVersion: 1, ...event })}\n`, 'utf8');
}

/** Only the current collection recovery SDK routes; unexpected requests are not forwarded. */
export function recoveryRouteAllowed(method, rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/') || rawPath.startsWith('//') || /[\p{Cc}\p{Cf}\\]/u.test(rawPath)) return false;
  const url = new URL(rawPath, `https://${recoveryHost}`);
  if (url.origin !== `https://${recoveryHost}` || url.hash) return false;
  const base = `/v2/resources/catalogue/${recoveryResource}`;
  if (method === 'PUT') return url.pathname === base && url.search === '';
  if (method !== 'GET') return false;
  if (url.pathname === '/v2/storages/files/info') return url.search === '?resourceTypeCode=CT001';
  if (url.pathname === '/v2/resources/attrs/getInfoByKey') return url.search === '?key=display_artist';
  const page = { skip: (value) => /^(0|[1-9]\d*)$/u.test(value) && Number.isSafeInteger(Number(value)) && Number(value) % 100 === 0,
    limit: (value) => value === '100', sortField: (value) => value === 'sortId', sortType: (value) => value === '1' };
  const routes = new Map([
    [`/v2/resources/${recoveryResource}`, { isLoadLatestVersionInfo: (value) => value === '1', isLoadPolicyInfo: (value) => value === '1' }],
    [`/v2/resources/${recoveryResource}/versions/snapshot_0`, {}], [`/v2/resources/${recoveryResource}/versions/snapshot_1`, {}],
    [`${base}/items`, page], [`${base}/items/collectRules`, {}], [`/v2/resources/catalogues/drafts/${recoveryResource}/items`, page],
    ['/v2/resources/types/listSimpleByGroup', { category: (value) => value === '1', status: (value) => value === '1', subjectType: (value) => value === '4' }],
    ['/v2/resources/types/getInfoByCode', { code: (value) => value === 'CT001' }],
  ]);
  const query = routes.get(url.pathname);
  return query !== undefined && [...url.searchParams].every(([key, value]) => Object.hasOwn(query, key)
    && url.searchParams.getAll(key).length === 1 && query[key](value));
}
