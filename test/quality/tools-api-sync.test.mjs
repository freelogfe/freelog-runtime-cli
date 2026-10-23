/** Upstream API parity at real request/type boundaries; no SDK import or network. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const toolsRoot = fileURLToPath(new URL('../../packages/tools-lib/', import.meta.url));
const requireTools = createRequire(path.join(toolsRoot, 'package.json'));
const ts = requireTools('typescript');

function loadApi(file) {
  let source = readFileSync(path.join(toolsRoot, 'src/service-API', file), 'utf8');
  assert.match(source, /import FUtil from '\.\.\/utils';/u);
  source = source.replace(/import FUtil from '\.\.\/utils';/u, 'const FUtil = { Request: capture };');
  source = source.replace(/import \{ getPlatform \} from '\.\.\/platform\/runtime';/u,
    'const getPlatform = () => { throw new Error("Unexpected platform access"); };');
  const emitted = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  assert.doesNotMatch(emitted, /\brequire\(/u, 'unexpected real dependency import');
  const calls = [], response = { ret: 0, errCode: 0, data: { observed: 'original-response' } };
  const exports = {};
  runInNewContext(emitted, { exports, capture: (config) => { calls.push(structuredClone(config)); return response; } });
  return { api: exports, calls, response };
}

test('Activity latest task detail uses exact upstream GET/query and preserves the response', () => {
  const { api, calls, response } = loadApi('activities.ts');
  assert.equal(typeof api.getLastTaskRecordDetail, 'function');
  assert.equal(api.getLastTaskRecordDetail({ taskConfigCode: 'task-code' }), response);
  assert.deepEqual(calls, [{ method: 'GET', url: '/v2/activities/facade/getLastTaskRecordDetail', params: { taskConfigCode: 'task-code' } }]);
});

test('version coverImages remains a version-body field, not a new resource update request', () => {
  const { api, calls, response } = loadApi('resources.ts');
  const body = { version: '1.1.0', fileSha1: 'sha', filename: 'clip.mp4', authExcludedItems: [], coverImages: ['https://image.freelog.com/cover'] };
  assert.equal(api.createVersion({ resourceId: 'resource-id', ...body }), response);
  assert.deepEqual(calls, [{ method: 'POST', url: '/v2/resources/resource-id/versions', data: body }]);
});

test('creatorName and RSS verificationCode pass through their original upstream request bodies', () => {
  const user = loadApi('user.ts');
  assert.equal(user.api.updateDetailInfo({ creatorName: 'creator', intro: '' }), user.response);
  assert.deepEqual(user.calls, [{ method: 'PUT', url: '/v2/users/current/detailInfo', data: { creatorName: 'creator', intro: '' } }]);
  const rss = loadApi('rss.ts');
  const data = { resourceId: 'collection-id', feedUrl: 'https://example.com/feed', verificationCode: 'sample-code' };
  assert.equal(rss.api.bindingsCompare(data), rss.response);
  assert.deepEqual(rss.calls, [{ method: 'POST', url: '/v2/rss/bindings/compare', data }]);
});

test('actual SDK types expose upstream fields, require the RSS code and retain verified CLI extensions', () => {
  const file = path.join(toolsRoot, 'src/__upstream_sync_typecheck__.ts');
  const source = `import api from './service-API';
api.Activity.getLastTaskRecordDetail({ taskConfigCode: 'task' });
api.Resource.createVersion({ resourceId: 'r', version: '1.0.0', fileSha1: 'sha', filename: 'x.mp4', authExcludedItems: [], coverImages: ['cover'], videoCover: 'retained' });
api.User.updateDetailInfo({ creatorName: 'creator' });
api.Rss.bindingsCompare({ resourceId: 'c', feedUrl: 'feed', verificationCode: 'sample' });
// @ts-expect-error upstream requires verificationCode; omission must stay invalid
api.Rss.bindingsCompare({ resourceId: 'c', feedUrl: 'feed' });
// @ts-expect-error optional coverImages still requires an array of strings
api.Resource.createVersion({ resourceId: 'r', version: '1.0.0', fileSha1: 'sha', filename: 'x', authExcludedItems: [], coverImages: 'bad' });
// @ts-expect-error creatorName is text, not a numeric ID
api.User.updateDetailInfo({ creatorName: 7 });
api.Contract.batchContracts({ subjectIds: 'r', subjectType: 1, licenseeId: 'c', licenseeIdentityType: 4 });
api.Contract.batchCreateContracts({ subjects: [{ subjectId: 'r', policyId: 'p', subjectType: 1 }], subjectType: 1, licenseeId: 'c', licenseeIdentityType: 4 });
`;
  const configFile = ts.readConfigFile(path.join(toolsRoot, 'tsconfig.json'), ts.sys.readFile);
  assert.equal(configFile.error, undefined);
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, toolsRoot);
  assert.deepEqual(config.errors, []);
  const options = { ...config.options, noEmit: true, types: ['node'], typeRoots: [path.join(toolsRoot, 'node_modules/@types')] };
  const host = ts.createCompilerHost(options);
  const baseRead = host.readFile.bind(host), baseExists = host.fileExists.bind(host);
  host.readFile = (name) => path.resolve(name) === file ? source : baseRead(name);
  host.fileExists = (name) => path.resolve(name) === file || baseExists(name);
  const baseSource = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...rest) => path.resolve(name) === file
    ? ts.createSourceFile(name, source, languageVersion, true) : baseSource(name, languageVersion, ...rest);
  const program = ts.createProgram([file], options, host);
  const errors = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(errors.map((e) => ({ code: e.code, message: ts.flattenDiagnosticMessageText(e.messageText, '\n') })), []);
});
