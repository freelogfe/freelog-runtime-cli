/**
 * AI 开发者场景取样：真实 CLI init + 只读 dev 数据，不发行、不签约。
 * 不实现预览提供器；输出的 BLOCKED 不能当作完整运行时 PASS。
 * 临时工程保留供复核；凭据仅在进程内读取，不写入报告。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveCliBin } from './acceptance/cli-bin.mjs';
import { fileURLToPath } from 'node:url';
import { FServiceAPI, FUtil } from '../packages/tools-lib/dist/node.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = resolveCliBin(repo);
const root = mkdtempSync(path.join(tmpdir(), 'freelog-ai-preview-walk-'));
const report = { platformEnv: 'dev', root, steps: [], resources: [], nodes: [], requests: [] };
const secrets = [];
const redact = (value) => secrets.reduce((text, secret) => secret ? text.replaceAll(secret, '<redacted>') : text, String(value));
const record = (id, status, detail) => {
  const row = { id, status, detail: redact(detail) };
  report.steps.push(row);
  console.log(JSON.stringify(row));
};
function cli(args, cwd = root) {
  const result = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', timeout: 120_000 });
  return { exit: result.status, output: redact(`${result.stdout ?? ''}\n${result.stderr ?? ''}`).trim() };
}
function dataOf(result) {
  if (result?.ret !== 0 || (result?.errCode ?? result?.errcode ?? 0) !== 0) throw new Error('Invalid API envelope');
  return result.data;
}
function listOf(result) {
  const data = dataOf(result);
  if (Array.isArray(data)) return data;
  for (const key of ['dataList', 'list', 'nodes', 'resources']) if (Array.isArray(data?.[key])) return data[key];
  throw new Error('Unknown list envelope');
}

// 请求层白名单：除了既有凭据登录，只允许 GET；不允许资源、节点、策略、合约写入。
FUtil.configurePlatform({ getEnv: () => 'dev' });
FUtil.Axios.defaults.timeout = 15_000;
FUtil.Axios.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toUpperCase();
  if (method !== 'GET' && !(method === 'POST' && config.url === '/v2/passport/login')) {
    throw new Error(`External mutation rejected: ${method} ${config.url}`);
  }
  report.requests.push({ method, url: config.url, params: method === 'GET' ? config.params : undefined });
  return config;
});
let cookie = '';
const transforms = FUtil.Axios.defaults.transformResponse;
FUtil.Axios.defaults.transformResponse = [
  (data, headers) => {
    const raw = headers?.['set-cookie'];
    if (raw && !cookie) {
      cookie = (Array.isArray(raw) ? raw : [raw]).map((item) => item.split(';')[0]).join('; ');
      secrets.push(cookie);
    }
    return data;
  },
  ...(Array.isArray(transforms) ? transforms : transforms ? [transforms] : []),
];

try {
  if (!existsSync(bin)) throw new Error('Build CLI first; bin missing');
  record('CLI_VERSION', 'OBSERVED', cli(['--cli-version']).output);
  for (const kind of process.argv.includes('--api-only') ? [] : ['theme', 'widget']) {
    const target = path.join(root, kind);
    const init = cli(['init', kind, target, '--template', 'vite-react-ts', '--yes', '--env', 'dev']);
    record(`INIT_${kind}`, init.exit === 0 ? 'PASS' : 'BLOCKED', init.output);
    if (init.exit !== 0) continue;
    const identity = JSON.parse(readFileSync(path.join(target, '.freelog/1.json'), 'utf8'));
    const pkg = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8'));
    record(`LOCAL_IDENTITY_${kind}`, !identity.resourceId ? 'PASS' : 'FAIL', JSON.stringify({
      typeCode: identity.typeCode, filePath: identity.filePath, bound: Boolean(identity.resourceId),
      hasDist: existsSync(path.join(target, 'dist')), templateName: pkg.name, templateVersion: pkg.version,
      files: readdirSync(target).filter((entry) => entry !== 'node_modules'),
    }));
    record(`PACKAGE_${kind}`, /<%=/.test(`${pkg.name} ${pkg.version}`) ? 'NEEDS_CHECK' : 'PASS',
      JSON.stringify({ name: pkg.name, version: pkg.version, scripts: pkg.scripts }));
    const edit = cli(['version', 'attr', 'add', 'name=作者 key=author value=AI-walkthrough', '--yes', '--env', 'dev'], target);
    record(`UNBOUND_ATTR_${kind}`, 'OBSERVED', JSON.stringify(edit));
  }
  const preview = cli(['preview']);
  record('PREVIEW_ENTRY', 'OBSERVED', JSON.stringify(preview));

  const credentials = JSON.parse(readFileSync(path.join(repo, 'test/.freelog-test-credentials.local.json'), 'utf8').replace(/^\uFEFF/, ''));
  const primary = credentials.primary;
  if (!primary?.password || !primary.loginName?.startsWith('freelog')) throw new Error('Expected authorized freelog primary account');
  secrets.push(primary.password);
  const login = dataOf(await FServiceAPI.User.login({ loginName: primary.loginName, password: primary.password, isRemember: 1 }));
  for (const key of ['token', 'tokenSn', 'authorization']) if (login?.[key]) secrets.push(String(login[key]));
  if (!cookie) throw new Error('Login returned no cookie; do not guess authorization');
  const rawToken = login.authorization ?? login.token ?? login.tokenSn;
  const authorization = rawToken && login.jwtType ? `${login.jwtType} ${rawToken}` : rawToken;
  if (authorization) secrets.push(authorization);
  FUtil.configurePlatform({ getEnv: () => 'dev', getHeaders: async () => ({ cookie }), getAuthorization: () => authorization, getUserId: () => login.userId });
  record('DEV_LOGIN', 'OBSERVED', JSON.stringify({
    loginEnvelopeSucceeded: true, secretFieldsPresent: Boolean(rawToken),
    cookieNames: cookie.split('; ').map((item) => item.slice(0, item.indexOf('='))),
    message: 'Login response succeeded; authenticated read must be verified separately; secrets kept in memory',
  }));

  for (const [kind, code] of [['theme', 'RT001'], ['plugin', 'RT002'], ['image', 'RT005001'], ['video', 'RT006003']]) {
    const candidates = listOf(await FServiceAPI.Resource.list({
      skip: 0, limit: 50, subjectType: 1, status: 1, resourceTypeCode: code,
      isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1,
    }));
    const candidate = candidates.find((item) => item.resourceId && item.latestVersion);
    if (!candidate) {
      record(`MARKET_${kind}`, 'BLOCKED', `No released sample in this query (${code})`);
      continue;
    }
    const info = dataOf(await FServiceAPI.Resource.info({ resourceIdOrName: candidate.resourceId, isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 }));
    const version = dataOf(await FServiceAPI.Resource.resourceVersionInfo1({ resourceId: info.resourceId, version: info.latestVersion }));
    const sample = {
      kind, resourceId: info.resourceId, resourceName: info.resourceName, typeCode: info.resourceTypeCode,
      latestVersion: info.latestVersion, status: info.status, subjectType: info.subjectType,
      enabledPolicies: (info.policies ?? []).filter((item) => item.status === 1).length,
      descriptors: (version.customPropertyDescriptors ?? []).map((item) => ({ key: item.key, type: item.type, defaultValue: item.defaultValue, candidateItems: item.candidateItems })),
      dependencies: (version.dependencies ?? []).map((item) => ({ resourceId: item.resourceId, versionRange: item.versionRange })),
      versionFields: Object.keys(version),
    };
    report.resources.push(sample);
    record(`MARKET_${kind}`, 'PASS', JSON.stringify(sample));
    if (kind === 'theme') {
      for (const dependency of sample.dependencies.slice(0, 2)) {
        const linked = dataOf(await FServiceAPI.Resource.info({ resourceIdOrName: dependency.resourceId, isLoadLatestVersionInfo: 1 }));
        record('RELEASED_THEME_DEPENDENCY', 'OBSERVED', JSON.stringify({
          resourceId: linked.resourceId, resourceName: linked.resourceName, typeCode: linked.resourceTypeCode,
          latestVersion: linked.latestVersion, declaredRange: dependency.versionRange, status: linked.status,
        }));
      }
    }
  }
  const nodes = listOf(await FServiceAPI.Node.nodes({ skip: 0, limit: 100 }));
  for (const node of nodes.slice(0, 3)) {
    const detail = dataOf(await FServiceAPI.Node.details({ nodeId: node.nodeId }));
    const summary = { nodeId: detail.nodeId, nodeDomain: detail.nodeDomain, status: detail.status, nodeThemeId: detail.nodeThemeId, fields: Object.keys(detail) };
    report.nodes.push(summary);
    record('FORMAL_NODE', 'OBSERVED', JSON.stringify(summary));
    if (!detail.nodeThemeId) continue;
    const theme = dataOf(await FServiceAPI.Exhibit.presentableDetails({
      presentableId: detail.nodeThemeId, isLoadVersionProperty: 1, isLoadCustomPropertyDescriptors: 1,
      isLoadDependencyTree: 1, isLoadResourceVersionInfo: 1,
    }));
    record('THEME_EXHIBIT', 'OBSERVED', JSON.stringify({
      sameId: theme.presentableId === detail.nodeThemeId,
      presentableId: theme.presentableId, version: theme.version, subjectType: theme.subjectType,
      rewriteKeys: (theme.presentableRewriteProperty ?? []).map((item) => item.key),
      dependencyCount: (theme.dependencyTree ?? []).length,
      dependencyRewriteCount: (theme.dependencyRewriteProperty ?? []).length, fields: Object.keys(theme),
    }));
  }
  if (!nodes.length) record('FORMAL_NODE', 'BLOCKED', 'Account has no formal node; do not create one implicitly');
  record('FULL_PREVIEW', 'BLOCKED', 'No implemented CLI/runtime preview provider: metadata selection is not a browser mock PASS');
} catch (error) {
  record('PROBE_ERROR', 'BLOCKED', error.message);
  process.exitCode = 1;
} finally {
  const reportPath = path.join(root, 'read-only-walkthrough.json');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Evidence: ${reportPath}`);
  console.log('Temporary projects retained. No resource/version/node/policy/contract publishing operations are included.');
}
