import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { typeInitRouteAllowed } from '../acceptance/type-init-control.mjs';
import { identityRouteAllowed } from '../acceptance/collection-identity-control.mjs';
import { typeInitExpectedRequests, typeInitNames } from '../acceptance/type-init-evidence.mjs';
test('all source-fixed type stimuli fit the narrow read-only route family', () => {
  for (const name of typeInitNames) for (const row of typeInitExpectedRequests(name)) assert.ok(typeInitRouteAllowed(row.method, `${row.path}?${new URLSearchParams(row.query)}`));
});
test('wrong subjects, methods, extra/missing/duplicate queries and foreign routes never reach loopback', () => {
  const route = '/v2/resources/types/listSimpleByGroup?category=1&status=1&subjectType=1';
  for (const method of ['POST', 'PUT', 'DELETE', 'get']) assert.equal(typeInitRouteAllowed(method, route), false);
  for (const raw of [route.replace('subjectType=1', 'subjectType=4'), route + '&extra=1', route + '&status=1', route.replace('&status=1', ''),
    '//evil.test/a', 'https://evil.test/a', route + '#fragment', '/v2/resources', '/v2/resources/types/getInfoByCode?code=CT001',
    '/v2/resources/types/listSimpleByParentCode?category=1&status=1&subjectType=1&isTerminate=true&nameChain=other']) assert.equal(typeInitRouteAllowed('GET', raw), false, raw);
  assert.equal(identityRouteAllowed('GET', route), false, 'Existing C01 predicate must remain subject-4-only.');
});
test('preload reuses guarded transport/loader; installed producer never injects CLI domain functions', () => {
  const preload = readFileSync(new URL('../acceptance/type-init-preload.mjs', import.meta.url), 'utf8');
  const producer = readFileSync(new URL('../verify-type-init.mjs', import.meta.url), 'utf8');
  assert.match(preload, /installCollectionLocalTransport\(config, typeInitRouteAllowed\)/u);
  assert.match(producer, /requireInstalledCli\(env\)/u);
  assert.match(producer, /writeSuiteCases\(\[result\], output\)/u);
  assert.ok(!/src\/domain|templateSource|npm.*pack/u.test(producer));
});
