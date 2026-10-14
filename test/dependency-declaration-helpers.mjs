import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { FServiceAPI, FUtil } from '../packages/tools-lib/dist/node.mjs';

export const testRoot = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(testRoot, '..');
export const cliBin = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'index.js');
export const apiBase = 'https://api.devfreelog.com';

export class BlockedError extends Error {}

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

export function redact(value) {
  return String(value)
    .replace(/(password|token|cookie|authorization)=([^\s|&]+)/gi, '$1=<redacted>')
    .replace(/(Bearer\s+)[^\s|]+/gi, '$1<redacted>');
}

export function makeContext(name, env) {
  const reportDir = path.join(tmpdir(), 'freelog-runtime-cli-verification');
  const reportPath = path.join(reportDir, `${name}.txt`);
  const lines = [];
  const log = (line) => {
    console.log(line);
    lines.push(line);
  };
  const finish = (result, message = '') => {
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(reportPath, `${lines.join('\n')}\n\n结果: ${result}${message ? `\n原因: ${message}` : ''}\n`, 'utf8');
    log(`报告: ${reportPath}`);
  };
  return { env, reportDir, reportPath, lines, log, finish };
}

export function runCli(ctx, label, args, { cwd, input, expectFailure = false, expectIncludes } = {}) {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd: cwd ?? repoRoot,
    input,
    encoding: 'utf8',
    timeout: label === 'login' ? 15_000 : 180_000,
  });
  const out = (result.stdout ?? '').trim();
  const err = (result.stderr ?? '').trim();
  const output = `${out}\n${err}`;
  const completed = result.status !== null && !result.error && !result.signal;
  const ok = completed && (expectFailure
    ? result.status !== 0 && (!expectIncludes || output.includes(expectIncludes))
    : result.status === 0);
  ctx.log(`${ok ? 'PASS' : 'FAIL'} ${label} (exit ${result.status})`);
  if (out) ctx.log(`  stdout: ${redact(out.slice(0, 700).replaceAll('\n', ' | '))}`);
  if (err) ctx.log(`  stderr: ${redact(err.slice(0, 700).replaceAll('\n', ' | '))}`);
  return { ok, out, err, output, status: result.status };
}

export function requireOk(result, message) {
  if (!result.ok) throw new Error(message);
  return result;
}

export async function loginForApi(primary) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${apiBase}/v2/passport/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginName: primary.loginName, password: primary.password, isRemember: 1 }),
      signal: controller.signal,
    });
    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [response.headers.get('set-cookie')].filter(Boolean);
    const cookie = setCookies.map((item) => item.split(';')[0]).join('; ');
    if ((response.status !== 200 && response.status !== 302) || !cookie) throw new Error(`API 登录失败 HTTP ${response.status}`);
    FUtil.configurePlatform({ getEnv: () => 'dev', getHeaders: async () => ({ cookie }) });
  } finally {
    clearTimeout(timer);
  }
}

function dataOf(result) {
  return result?.data ?? result;
}

function listOf(result, label) {
  const data = dataOf(result);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.dataList)) return data.dataList;
  if (Array.isArray(data?.list)) return data.list;
  throw new Error(`${label} 响应不是已知列表形状。`);
}

export async function resourceInfo(resourceIdOrName) {
  return dataOf(await FServiceAPI.Resource.info({
    resourceIdOrName,
    isLoadLatestVersionInfo: 1,
    isLoadPolicyInfo: 1,
    isTranslate: 1,
  }));
}

export async function assertDependencyTarget(target) {
  const info = await resourceInfo(target.resourceId);
  const subjectTypes = Array.isArray(info.subjectType) ? info.subjectType : [info.subjectType];
  if (!subjectTypes.some((value) => Number(value) === 1) || Number(info.status) !== 1 || !info.latestVersion) {
    throw new BlockedError(`依赖目标不可用或无 latest: ${target.resourceId}`);
  }
  return {
    ...target,
    resourceName: info.resourceName ?? target.resourceName,
    latestVersion: String(info.latestVersion),
    range: target.range || `^${info.latestVersion}`,
  };
}

export async function choosePoolTarget(pool, predicate, message) {
  const diagnostics = [];
  for (const item of pool.resources ?? []) {
    if (typeof item?.resourceId !== 'string') continue;
    if (!predicate(item)) continue;
    try {
      return await assertDependencyTarget(item);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      diagnostics.push(`${item.resourceId}: ${reason}`);
      if (!(error instanceof BlockedError)) {
        throw new Error(`依赖目标查询失败，不能当作无样本跳过：${item.resourceId}: ${reason}`);
      }
    }
  }
  throw new BlockedError(`${message}${diagnostics.length ? ` 诊断: ${diagnostics.join(' | ')}` : ''}`);
}

export async function exactContracts(licenseeId, licenseeIdentityType, subjectId) {
  const list = [];
  for (const contractStatus of [0, 1, 2]) {
    list.push(...listOf(await FServiceAPI.Contract.batchContracts({
      subjectIds: subjectId,
      subjectType: 1,
      licenseeId,
      licenseeIdentityType,
      contractStatus,
    }), `合同列表（状态 ${contractStatus}）`));
  }
  return list.filter((contract, index) => {
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
      throw new Error(`合同列表第 ${index} 行不是对象。`);
    }
    const row = contract;
    if (typeof row.contractId !== 'string' || row.contractId.trim().length === 0) {
      throw new Error(`合同列表第 ${index} 行缺少 contractId，不能判定无合同。`);
    }
    for (const [field, expected] of [
      ['licenseeId', licenseeId],
      ['licenseeIdentityType', licenseeIdentityType],
      ['subjectId', subjectId],
      ['subjectType', 1],
    ]) {
      if (row[field] === undefined || row[field] === null || row[field] === '') {
        throw new Error(`合同列表第 ${index} 行缺少 ${field}，不能判定是否为当前双方合同。`);
      }
      const actual = field === 'licenseeIdentityType' || field === 'subjectType' ? Number(row[field]) : String(row[field]);
      const wanted = field === 'licenseeIdentityType' || field === 'subjectType' ? Number(expected) : String(expected);
      if (actual !== wanted) throw new Error(`合同列表第 ${index} 行 ${field} 不属于请求的双方，不能当作无合同。`);
    }
    return true;
  });
}

export async function assertNoContracts(ctx, label, licenseeId, licenseeIdentityType, subjectId) {
  const contracts = await exactContracts(licenseeId, licenseeIdentityType, subjectId);
  ctx.log(`[api] ${label}: exact contracts=${contracts.length}`);
  if (contracts.length !== 0) throw new Error(`${label} 已存在双方合同，不能证明无合同声明。`);
}

export function draftDeps(work) {
  const draft = path.join(work, '.freelog', '1.version.json');
  if (!existsSync(draft)) return [];
  return readJson(draft).dependencies ?? [];
}

export function collectionDeps(work, collectionId, env) {
  const draft = path.join(work, '.freelog', 'collection-forms', env, `${encodeURIComponent(collectionId)}.json`);
  if (!existsSync(draft)) return [];
  return readJson(draft).form?.dependencies ?? [];
}

export function copyDirectoryContents(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) cpSync(path.join(source, entry), path.join(destination, entry), { recursive: true });
}

function pngChunk(type, payload) {
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write(type, 4, 'ascii');
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + payload.length)), 8 + payload.length);
  return chunk;
}

function crc32(input) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function writeUniquePng(destination) {
  const width = 67;
  const height = 43;
  const stamp = Date.now();
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const start = row * (width * 3 + 1);
    for (let column = 0; column < width; column += 1) {
      const pixel = start + 1 + column * 3;
      raw[pixel] = (stamp + row + column) & 255;
      raw[pixel + 1] = ((stamp >>> 8) + row * 3) & 255;
      raw[pixel + 2] = ((stamp >>> 16) + column * 5) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(destination, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

export async function createPreparedResource(ctx, primary, spec) {
  const work = mkdtempSync(path.join(tmpdir(), `freelog-declaration-${spec.kind}-`));
  const E = ['--env', ctx.env];
  const stamp = `${Date.now().toString(36)}-${spec.kind}`;
  try {
    requireOk(runCli(ctx, 'login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], { cwd: work, input: `${primary.password}\n` }), '登录失败');
    if (spec.kind === 'theme') {
      requireOk(runCli(ctx, 'init theme', ['init', 'theme', '.', '--template', 'vite-react-ts', '--yes', ...E], { cwd: work }), '主题 init 失败');
      copyDirectoryContents(path.join(testRoot, 'fixtures', 'theme-artifact'), path.join(work, 'dist'));
      writeFileSync(firstFile(path.join(work, 'dist')), `\n<!-- declaration ${stamp} -->\n`, { flag: 'a' });
    } else if (spec.kind === 'image') {
      writeUniquePng(path.join(work, 'sample-image.png'));
      requireOk(runCli(ctx, 'init image', ['init', '.', '--type', 'RT005001', '--artifact', 'sample-image.png', '--yes', ...E], { cwd: work }), '图片 init 失败');
    } else {
      cpSync(path.join(testRoot, 'fixtures', 'media', 'sample-video.mp4'), path.join(work, 'sample-video.mp4'));
      requireOk(runCli(ctx, 'init video', ['init', '.', '--type', 'RT006003', '--artifact', 'sample-video.mp4', '--yes', ...E], { cwd: work }), '视频 init 失败');
    }
    const type = spec.kind === 'theme' ? 'RT001' : spec.kind === 'image' ? 'RT005001' : 'RT006003';
    const artifact = spec.kind === 'theme' ? 'dist' : spec.kind === 'image' ? 'sample-image.png' : 'sample-video.mp4';
    requireOk(runCli(ctx, 'create resource shell', ['create', '--title', `decl-${stamp}`, '--type', type, '--name', `decl-${stamp}`, '--artifact', artifact, '--yes', ...E], { cwd: work }), '建壳失败');
    requireOk(runCli(ctx, 'create-version --prepare', ['create-version', '--prepare', '--yes', ...E], { cwd: work }), '备稿失败');
    const identity = readJson(path.join(work, '.freelog', '1.json'));
    return { work, identity, licenseeIdentityType: 1, envArgs: E, managedTempPrefix: `freelog-declaration-${spec.kind}-` };
  } catch (error) {
    cleanupProject(ctx, { work, envArgs: E, managedTempPrefix: `freelog-declaration-${spec.kind}-` });
    throw error;
  }
}

export async function createCollectionShell(ctx, primary) {
  const work = mkdtempSync(path.join(tmpdir(), 'freelog-collection-declaration-'));
  const E = ['--env', ctx.env];
  const stamp = `${Date.now().toString(36)}-collection`;
  try {
    requireOk(runCli(ctx, 'login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], { cwd: work, input: `${primary.password}\n` }), '登录失败');
    requireOk(runCli(ctx, 'collection create', ['collection', 'create', '--type', 'RT003011', '--title', `decl-${stamp}`, '--name', `decl-${stamp}`, '--yes', ...E], { cwd: work }), '合集建壳失败');
    const identity = readJson(path.join(work, '.freelog', '1.json'));
    requireOk(runCli(ctx, 'collection form pull', ['collection', 'form', 'pull', '--out', 'collection-form.json', '--yes', ...E], { cwd: work }), '合集拉稿失败');
    return { work, identity, licenseeIdentityType: 4, envArgs: E, managedTempPrefix: 'freelog-collection-declaration-' };
  } catch (error) {
    cleanupProject(ctx, { work, envArgs: E, managedTempPrefix: 'freelog-collection-declaration-' });
    throw error;
  }
}

/** 读回平台持久化的完整声明；成功回显不能代替线上版本事实。 */
export async function assertPublishedDependencies(ctx, source, expected, version) {
  const resourceId = source.identity.resourceId;
  const info = await resourceInfo(resourceId);
  const currentVersion = version ?? info.latestVersion;
  if (!currentVersion) throw new Error('发布后没有 latestVersion。');
  const snapshot = dataOf(await FServiceAPI.Resource.resourceVersionInfo1({ resourceId, version: currentVersion }));
  if (!Array.isArray(snapshot?.dependencies)) throw new Error('发布快照缺少 dependencies 列表。');
  const normalize = (items) => items.map(({ resourceId, versionRange }) => ({ resourceId, versionRange })).sort((a, b) => a.resourceId.localeCompare(b.resourceId));
  if (JSON.stringify(normalize(snapshot.dependencies)) !== JSON.stringify(normalize(expected))) {
    throw new Error(`发布快照依赖与本地声明不一致: ${resourceId}`);
  }
  ctx.log(`[api] published ${resourceId}@${currentVersion}: dependencies=${expected.length}`);
  for (const target of expected) {
    await assertNoContracts(ctx, 'after publish', resourceId, source.licenseeIdentityType, target.resourceId);
  }
}

function firstFile(dir) {
  for (const entry of readdirSync(dir)) {
    const candidate = path.join(dir, entry);
    if (statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`目录 ${dir} 没有文件`);
}

export function cleanupProject(ctx, source) {
  const resolved = path.resolve(source.work);
  const tempRoot = path.resolve(tmpdir());
  const base = path.basename(resolved);
  if (!resolved.startsWith(`${tempRoot}${path.sep}`) || !base.startsWith(source.managedTempPrefix)) {
    throw new Error(`拒绝清理非本脚本生成的临时目录: ${resolved}`);
  }
  const logout = runCli(ctx, 'logout', ['logout', '--yes', ...source.envArgs], { cwd: resolved });
  if (!logout.ok && !logout.output.includes('没有可删除的凭据')) {
    throw new Error(`logout 失败，未删除临时目录: ${resolved}`);
  }
  rmSync(resolved, { recursive: true, force: true });
}
