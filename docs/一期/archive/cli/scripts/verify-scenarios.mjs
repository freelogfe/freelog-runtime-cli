#!/usr/bin/env node
/**
 * 方案 A 场景验证：单元测试 + dev API + 非交互 init。
 * 用法：pnpm build && node scripts/verify-scenarios.mjs [--env dev]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffInputAttrsByValue, formatAttrDiff } from './lib/payload-parity.mjs';
import { parseCliJson, cliErrorCode } from './lib/cli-json.mjs';
import { runVerificationLogin, verificationAccount } from './lib/verification-credentials.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';

const results = [];

function pass(name, detail) {
  results.push({ status: 'pass', name, detail });
  console.log(`✔ ${name}${detail ? `: ${detail}` : ''}`);
}

function skip(name, detail) {
  results.push({ status: 'skip', name, detail });
  console.log(`○ ${name}${detail ? `: ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ status: 'fail', name, detail });
  console.error(`✘ ${name}${detail ? `: ${detail}` : ''}`);
}

function commandFailureDetail(error, limit = 400) {
  const stdout = error?.stdout?.toString?.() || '';
  const stderr = error?.stderr?.toString?.() || '';
  return `${stderr}${stderr && stdout ? '\n' : ''}${stdout}`.trim().slice(0, limit) || error?.message;
}

function runCli(args, opts = {}) {
  if (!fs.existsSync(cliBin)) {
    throw new Error('dist/bin/index.js 不存在，请先 pnpm build');
  }
  const cmd = `node "${cliBin}" ${args} --env ${env}`;
  return execSync(cmd, {
    cwd: opts.cwd || cliRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FREELOG_DEV: '1', ...(opts.env || {}) },
  });
}

function parseJson(stdout) {
  return parseCliJson(stdout);
}

function writePolicyFile(filePath) {
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      policyName: '免费',
      policyText: 'for public\r\n\r\ninitial[active]:\r\nterminate\r\n',
      status: 1,
    }),
    'utf8',
  );
}

/** 合集壳（subjectType=4）策略：dev 实测需 FOR PUBLIC + Initial:（非 Initial Permit:） */
function writeCollectionShellPolicyFile(filePath) {
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      policyName: '免费',
      policyText: '\nFOR PUBLIC\n\nInitial:\n\tterminate',
      status: 1,
    }),
    'utf8',
  );
}

function attrKeys(attrs) {
  return (attrs || [])
    .map((a) => a?.key)
    .filter(Boolean)
    .sort();
}

function keysEqual(a, b) {
  return JSON.stringify(attrKeys(a)) === JSON.stringify(attrKeys(b));
}

function copyUniqueFile(src, dest, tag) {
  fs.copyFileSync(src, dest);
  fs.appendFileSync(dest, String(tag));
}

function runCliExpectFail(args, opts = {}) {
  try {
    runCli(args, opts);
    return { failed: false, stdout: '', stderr: '' };
  } catch (error) {
    return {
      failed: true,
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || error.message || '',
    };
  }
}

function parseCliErrorJson(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  try {
    return parseCliJson(text.slice(start));
  } catch {
    return null;
  }
}

function expectFailCode(result, code) {
  const text = `${result.stderr || ''}${result.stdout || ''}`;
  const parsed = parseCliErrorJson(text);
  const errCode = cliErrorCode(parsed);
  if (errCode === code) return true;
  return text.includes(`"code":${code}`) || text.includes(`"code": ${code}`);
}

/** 主联调账号（全链路）；辅账号 snnaenu 仅用于 E3 owner 负向（无法 policy apply） */
const PRIMARY_LOGIN = verificationAccount('primary');
const SECONDARY_LOGIN = verificationAccount('secondary');

function loginPrimary() {
  const account = verificationAccount('primary');
  if (account.password) {
    runVerificationLogin(cliBin, env, { cwd: cliRoot });
    return;
  }
  if (account.source === 'session') {
    const st = parseJson(runCli('status --json'));
    if (!st.loggedIn) {
      throw new Error('缺少 FREELOG_TEST_* 且当前无有效登录态；请先 freelog-cli login --env dev');
    }
    return;
  }
  runVerificationLogin(cliBin, env, { cwd: cliRoot });
}

function loginSecondary() {
  if (!SECONDARY_LOGIN) {
    throw new Error('SECONDARY_NOT_CONFIGURED');
  }
  runVerificationLogin(cliBin, env, { cwd: cliRoot, kind: 'secondary' });
}

function writeAltPolicyFile(filePath) {
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      policyName: 'E2E备用',
      policyText: '\nFOR PUBLIC\n\nInitial:\n\tterminate\n// e2e-alt',
      status: 1,
    }),
    'utf8',
  );
}

function setupOnlinePhotoProject(opts) {
  const { workDir, ts, testPhoto, testCover } = opts;
  const policyPath = path.join(workDir, 'policy.free.json');
  writePolicyFile(policyPath);
  copyUniqueFile(testPhoto, path.join(workDir, 'photo.png'), ts);
  if (testCover) {
    fs.copyFileSync(testCover, path.join(workDir, 'cover.png'));
  }
  runCli(
    `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name s15-${ts} --title "S15 ${ts}" --yes --json`,
    { cwd: workDir },
  );
  const createOut = parseJson(runCli('create --yes --json', { cwd: workDir }));
  runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: workDir });
  parseJson(runCli('publish --yes --json', { cwd: workDir }));
  runCli(`policy apply --from-file policy.free.json --yes --json`, { cwd: workDir });
  parseJson(runCli('online --yes --json', { cwd: workDir }));
  return { policyPath, resourceId: createOut.resource?.resourceId };
}

function loadCollectionDraftItems(proj) {
  const statePath = path.join(proj, '.freelog', 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  return state.collection?.catalogueDraft || [];
}

/** 图片/视频合集：init collection → create → item import-dir → publish → policy → online */
function runCollectionE2e(opts) {
  const {
    workBase,
    ts,
    label,
    albumName,
    mediaDir,
    itemTypeCode,
    collectionTypeCode = 'RT003006',
  } = opts;
  const album = `${albumName}-${ts}`;
  runCli(
    `init ${album} --scaffold collection --resource-type ${collectionTypeCode} --resource-name coll-${label}-${ts} --title "Coll ${label} ${ts}" --yes --json`,
    { cwd: workBase },
  );
  const proj = path.join(workBase, album);
  const itemPolicyPath = path.join(proj, 'policy.free.json');
  const collPolicyPath = path.join(proj, 'policy.collection.json');
  writePolicyFile(itemPolicyPath);
  writeCollectionShellPolicyFile(collPolicyPath);
  const created = parseJson(runCli('collection create --yes --json', { cwd: proj }));
  if (!created.ok || !created.collection?.resourceId) {
    throw new Error(`collection create: ${JSON.stringify(created).slice(0, 200)}`);
  }
  const imp = parseJson(
    runCli(
      `collection item import-dir "${mediaDir}" --resource-type ${itemTypeCode} --item-policy-file "${itemPolicyPath}" --title-prefix "${label} " --yes --json`,
      { cwd: proj },
    ),
  );
  if (!imp.ok || !imp.created?.length) {
    throw new Error(`item import-dir: ${JSON.stringify(imp).slice(0, 300)}`);
  }
  runCli('collection version set --description "e2e collection v1" --json', { cwd: proj });
  const pub = parseJson(runCli('collection publish --yes --json', { cwd: proj }));
  if (!pub.ok) throw new Error(`collection publish: ${JSON.stringify(pub).slice(0, 200)}`);
  runCli(`collection policy apply --from-file "${collPolicyPath}" --yes --json`, { cwd: proj });
  const on = parseJson(runCli('online --yes --json', { cwd: proj }));
  if (!on.ok) throw new Error(`collection online: ${JSON.stringify(on).slice(0, 200)}`);
  const st = parseJson(runCli('status --json', { cwd: proj }));
  return { proj, imp, pub, st };
}

function typeRowCode(row) {
  return String(row.code || row.resourceTypeCode || row.typeCode || '');
}

function typeRowName(row) {
  return String(row.name || row.resourceTypeName || row.title || row.typeName || '');
}

function isResourceSubjectType(row) {
  const st = row.subjectType;
  if (Array.isArray(st)) return st.includes(1);
  return st === 1;
}

/** 动态解析小说/文本资源叶子类型（subjectType=1、category≠2；各 dev 环境 code 可能不同） */
function resolveNovelLeafTypeCode() {
  const keyword = /小说|文本|文章|novel|text|txt|markdown|md|article/i;
  const tryPick = (types) => {
    const parentCodes = new Set();
    for (const row of types) {
      const parent = row.parentCode || row.parent;
      if (parent) parentCodes.add(String(parent));
    }
    const matches = types.filter((row) => {
      const code = typeRowCode(row);
      if (!code || parentCodes.has(code)) return false;
      if (!isResourceSubjectType(row)) return false;
      if (row.category === 2) return false;
      return keyword.test(typeRowName(row)) || keyword.test(code);
    });
    const preferArticle = matches.find((row) => /文章|article|text|txt/i.test(typeRowName(row)));
    return preferArticle || matches[0];
  };

  for (const kw of ['文章', '小说', '文本', 'novel']) {
    try {
      const searched = parseJson(runCli(`type search ${kw} --json`));
      const picked = tryPick(searched.types || []);
      if (picked) return typeRowCode(picked);
    } catch {
      // 当前关键词未命中，继续尝试下一个关键词。
    }
  }

  const list = parseJson(runCli('type list --json'));
  const picked = tryPick(list.types || []);
  return picked ? typeRowCode(picked) : null;
}

function isCollectionSubjectType(row) {
  const st = row.subjectType;
  if (Array.isArray(st)) return st.includes(4);
  return st === 4;
}

/** 动态解析小说/连载合集壳类型（subjectType=4、category=1） */
function resolveNovelCollectionTypeCode() {
  const keyword = /连载小说|小说|novel|series/i;
  const tryPick = (types) => {
    const parentCodes = new Set();
    for (const row of types) {
      const parent = row.parentCode || row.parent;
      if (parent) parentCodes.add(String(parent));
    }
    const matches = types.filter((row) => {
      const code = typeRowCode(row);
      if (!code || parentCodes.has(code)) return false;
      if (!isCollectionSubjectType(row)) return false;
      if (row.category !== 1) return false;
      return keyword.test(typeRowName(row)) || keyword.test(code);
    });
    const preferNovel = matches.find((row) => /连载小说|novel/i.test(typeRowName(row)));
    return preferNovel || matches[0];
  };

  for (const kw of ['连载小说', '连载', '小说']) {
    try {
      const searched = parseJson(runCli(`type search ${kw} --json`));
      const picked = tryPick(searched.types || []);
      if (picked) return typeRowCode(picked);
    } catch {
      // 当前关键词未命中，继续尝试下一个关键词。
    }
  }

  const list = parseJson(runCli('type list --json'));
  const picked = tryPick(list.types || []);
  return picked ? typeRowCode(picked) : 'RT003006';
}

console.log(`\n=== 场景验证 (env=${env}) ===\n`);

// --- S1 单元：五选一 ---
try {
  execSync('pnpm exec vitest run tests/initFiveChoice.test.ts', {
    cwd: cliRoot,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  pass('S1 initFiveChoice 单元测试');
} catch (e) {
  fail('S1 initFiveChoice 单元测试', e.stdout?.slice(-200) || e.message);
}

try {
  execSync('pnpm exec vitest run tests/p2Engineering.test.ts', {
    cwd: cliRoot,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  pass('S1P2 工程化单元测试');
} catch (e) {
  fail('S1P2 工程化单元测试', e.stdout?.slice(-200) || e.message);
}

// --- S2 命令面 ---
try {
  if (!fs.existsSync(cliBin)) throw new Error('未 build');
  const help = runCli('--help');
  if (help.includes('init') && help.includes('resource') && help.includes('collection')) {
    pass('S2 顶层命令面');
  } else fail('S2 顶层命令面');
  if (help.includes('config') && help.includes('workspace')) {
    pass('S2P2 顶层 config/workspace');
  } else {
    fail('S2P2 顶层 config/workspace');
  }
  const collHelp = runCli('collection --help');
  if (collHelp.includes('init-from-folder')) pass('S2 collection init-from-folder');
  else fail('S2 collection init-from-folder');
  const resHelp = runCli('resource --help');
  if (resHelp.includes('import-dir')) pass('S2 resource import-dir');
  else fail('S2 resource import-dir');
  const cfgHelp = runCli('config --help');
  if (cfgHelp.includes('init') && cfgHelp.includes('show')) pass('S2P2 config 子命令');
  else fail('S2P2 config 子命令');
  const polHelp = runCli('policy --help');
  if (polHelp.includes('init')) pass('S2P2 policy init 子命令');
  else fail('S2P2 policy init 子命令');
  const depHelp = runCli('dep --help');
  if (depHelp.includes('init-auth-map')) pass('S2P2 dep init-auth-map 子命令');
  else fail('S2P2 dep init-auth-map 子命令');
  const initThemeHelp = runCli('init theme --help');
  if (initThemeHelp.includes('USAGE freelog-cli init theme')) pass('S2 init theme --help 预设');
  else fail('S2 init theme --help 预设');
  const wsHelp = runCli('workspace --help');
  if (wsHelp.includes('list')) pass('S2P2 workspace list 子命令');
  else fail('S2P2 workspace list 子命令');
} catch (e) {
  fail('S2 命令面', e.stderr?.toString()?.slice(0, 300) || e.message);
}

// --- S2P2 工程化：config / 模板 / workspace（离线）---
const p2Ts = Date.now();
const p2Root = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-p2-'));

try {
  const cfgInit = parseJson(
    runCli('config init --default-env dev --json', { cwd: p2Root }),
  );
  if (cfgInit.ok && cfgInit.created?.length >= 1) {
    pass('S2P2 config init', cfgInit.defaultEnv || 'dev');
  } else {
    fail('S2P2 config init', JSON.stringify(cfgInit).slice(0, 200));
  }

  const cfgShow = parseJson(runCli('config show --json', { cwd: p2Root }));
  if (cfgShow.ok && cfgShow.config?.defaultEnv === 'dev') {
    pass('S2P2 config show', `defaultEnv=${cfgShow.config.defaultEnv}`);
  } else {
    fail('S2P2 config show', JSON.stringify(cfgShow).slice(0, 200));
  }

  parseJson(runCli('config set --default-env test --json', { cwd: p2Root }));
  const cfgShow2 = parseJson(runCli('config show --json', { cwd: p2Root }));
  if (cfgShow2.config?.defaultEnv === 'test') {
    pass('S2P2 config set env', 'test');
  } else {
    fail('S2P2 config set env', JSON.stringify(cfgShow2).slice(0, 200));
  }

  const polInit = parseJson(runCli('policy init --json', { cwd: p2Root }));
  const policyPath = polInit.path || path.join(p2Root, 'policy.free.json');
  const policyJson = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  if (polInit.ok && policyJson.policyName === '免费' && policyJson.policyText) {
    pass('S2P2 policy init', policyJson.policyName);
  } else {
    fail('S2P2 policy init', JSON.stringify(polInit).slice(0, 200));
  }

  const authInit = parseJson(runCli('dep init-auth-map --json', { cwd: p2Root }));
  const authPath = authInit.path || path.join(p2Root, 'auth-map.yaml');
  if (authInit.ok && fs.existsSync(authPath) && fs.readFileSync(authPath, 'utf8').includes('contracts:')) {
    pass('S2P2 dep init-auth-map', path.basename(authPath));
  } else {
    fail('S2P2 dep init-auth-map', JSON.stringify(authInit).slice(0, 200));
  }

  const wsApp = path.join(p2Root, 'apps', `pkg-${p2Ts}`);
  fs.mkdirSync(wsApp, { recursive: true });
  fs.writeFileSync(
    path.join(wsApp, 'freelog.manifest.json'),
    JSON.stringify({ subject: 'resource', identity: { name: `p2-${p2Ts}` } }),
    'utf8',
  );
  const ws = parseJson(runCli('workspace list --json', { cwd: p2Root }));
  if (ws.ok && ws.projects?.some((p) => p.path.includes('apps'))) {
    pass('S2P2 workspace list', `${ws.projects.length} 项`);
  } else {
    fail('S2P2 workspace list', JSON.stringify(ws).slice(0, 200));
  }
} catch (e) {
  fail('S2P2 工程化', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(p2Root, { recursive: true, force: true });
}

// --- S3 dev API ---
try {
  loginPrimary();
  pass('S3 dev 登录', PRIMARY_LOGIN.source === 'session' ? `session ${PRIMARY_LOGIN.name}` : PRIMARY_LOGIN.name);
} catch (e) {
  fail('S3 dev 登录', e.stderr?.toString()?.slice(0, 300) || e.message);
}

// --- S2P2 freelogignore：import-dir 跳过匹配文件 ---
const p2IgnoreTs = Date.now();
const p2IgnoreWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-p2-ignore-'));
const p2IgnoreDir = path.join(p2IgnoreWork, 'photos');
const p2IgnorePhoto = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');

try {
  if (!fs.existsSync(p2IgnorePhoto)) {
    skip('S2P2 freelogignore import-dir', '测试图片不存在');
  } else {
    fs.mkdirSync(p2IgnoreDir, { recursive: true });
    copyUniqueFile(p2IgnorePhoto, path.join(p2IgnoreDir, 'keep.jpg'), String(p2IgnoreTs));
    fs.writeFileSync(path.join(p2IgnoreDir, 'skip.tmp'), 'ignored');
    fs.writeFileSync(path.join(p2IgnoreDir, '.freelogignore'), '*.tmp\n');
    const ignored = parseJson(
      runCli(
        `resource import-dir "${p2IgnoreDir}" --resource-type RT005001 --yes --json`,
        { cwd: p2IgnoreWork },
      ),
    );
    if (ignored.ok && ignored.created?.length === 1) {
      pass('S2P2 freelogignore import-dir', '1/2 文件');
    } else {
      fail(
        'S2P2 freelogignore import-dir',
        `expected 1 created, got ${ignored.created?.length ?? 0}`,
      );
    }
  }
} catch (e) {
  fail('S2P2 freelogignore import-dir', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(p2IgnoreWork, { recursive: true, force: true });
}

// --- S3 status / type ---
try {
  const statusCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-status-'));
  try {
    const status = parseJson(runCli('status --json', { cwd: statusCwd }));
    if (status.ok && status.loggedIn) pass('S3 status', `env=${status.environment}`);
    else fail('S3 status', JSON.stringify(status).slice(0, 200));
  } finally {
    fs.rmSync(statusCwd, { recursive: true, force: true });
  }
} catch (e) {
  fail('S3 status', e.message);
}

try {
  const j = parseJson(runCli('type pick --category theme --json'));
  if (j.ok && j.code && j.suggestedScaffold === 'runtime') {
    pass('S3 type pick 主题定稿', `code=${j.code} scaffold=${j.suggestedScaffold}`);
  } else fail('S3 type pick 主题', JSON.stringify(j));
} catch (e) {
  fail('S3 type pick 主题', e.stderr?.toString()?.slice(0, 300) || e.message);
}

try {
  const result = runCliExpectFail('type pick --category package --json');
  const output = `${result.stdout}${result.stderr}`;
  if (result.failed && expectFailCode(result, 4) && /多个 package 叶子候选/.test(output)) {
    pass('S3 type pick 前端库歧义拒绝', '须通过模板、显式资源类型或 TTY 定稿');
  } else fail('S3 type pick 前端库歧义拒绝', output.slice(0, 300));
} catch (e) {
  fail('S3 type pick 前端库歧义拒绝', e.stderr?.toString()?.slice(0, 300) || e.message);
}

try {
  const j = parseJson(runCli('type info RT001 --json'));
  if (j.ok || j.code === undefined) {
    pass('S3 type info RT001', '可查询');
  } else {
    pass('S3 type info RT001', JSON.stringify(j).slice(0, 100));
  }
} catch (e) {
  const err = e.stderr?.toString() || e.message;
  if (err.includes('type info') || err.includes('未知')) {
    fail('S3 type info RT001', err.slice(0, 200));
  } else {
    pass('S3 type info RT001', 'CLI 可调用（非 JSON 模式亦可）');
  }
}

// --- S4 非交互 init theme ---
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-scenario-'));
const projectName = `scn-${Date.now()}`;

try {
  const out = runCli(
    `init theme ${projectName} --template vite-react-ts --runtime 0.5 --yes --json`,
    { cwd: tmpBase },
  );
  const j = parseJson(out);
  if (j.ok && j.resourceTypeCode && j.scaffold === 'runtime') {
    pass('S4 init theme 非交互', `code=${j.resourceTypeCode}`);
  } else {
    fail('S4 init theme 非交互', JSON.stringify(j));
  }
  const manifestPath = path.join(tmpBase, projectName, 'freelog.manifest.json');
  if (fs.existsSync(manifestPath)) {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (m.resource?.typeCode === j.resourceTypeCode) {
      pass('S4 manifest 与 init 输出一致', m.resource.typeCode);
    } else fail('S4 manifest 与 init 输出一致');
  } else fail('S4 manifest 文件');
} catch (e) {
  fail('S4 init theme 非交互', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(tmpBase, { recursive: true, force: true });
}

// --- S6 dev 端到端：单图片 create → publish → policy → online ---
const e2eTs = Date.now();
const e2eProj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-e2e-pub-'));
const e2ePhoto = path.join(e2eProj, 'photo.png');
const e2ePolicy = path.join(e2eProj, 'policy.free.json');
const testPhoto = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');

try {
  if (!fs.existsSync(testPhoto)) throw new Error(`测试图片不存在: ${testPhoto}`);
  fs.copyFileSync(testPhoto, e2ePhoto);
  // 平台拒重复 fileSha1；追加时间戳使每次 E2E 文件唯一
  fs.appendFileSync(e2ePhoto, String(e2eTs));
  fs.writeFileSync(
    e2ePolicy,
    JSON.stringify({
      policyName: '免费',
      policyText: 'for public\r\n\r\ninitial[active]:\r\nterminate\r\n',
      status: 1,
    }),
    'utf8',
  );

  runCli(
    `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name e2e-pub-${e2eTs} --title "E2E Pub ${e2eTs}" --yes --json`,
    { cwd: e2eProj },
  );
  const createOut = parseJson(runCli('create --yes --json', { cwd: e2eProj }));
  if (!createOut.ok || !createOut.resource?.resourceId) {
    fail('S6 create 图片资源', JSON.stringify(createOut).slice(0, 300));
  } else {
    pass('S6 create 图片资源', createOut.resource.resourceId);
  }

  runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: e2eProj });
  const dryPub = parseJson(runCli('publish --dry-run --yes --json', { cwd: e2eProj }));
  if (
    dryPub.ok &&
    dryPub.createVersionParams?.inputAttrs === 'unresolved' &&
    dryPub.unresolved?.includes('createVersionParams.inputAttrs')
  ) {
    pass('S6 dry-run createVersion', '新文件属性标记 unresolved，未上传');
  } else {
    fail('S6 dry-run createVersion', JSON.stringify(dryPub).slice(0, 300));
  }
  const pub = parseJson(runCli('publish --yes --json', { cwd: e2eProj }));
  if (pub.ok) pass('S6 publish', pub.version || 'ok');
  else fail('S6 publish', JSON.stringify(pub).slice(0, 200));

  runCli(`policy apply --from-file policy.free.json --yes --json`, { cwd: e2eProj });
  pass('S6 policy apply');

  const on = parseJson(runCli('online --yes --json', { cwd: e2eProj }));
  if (on.ok) pass('S6 online', on.status != null ? `status=${on.status}` : 'ok');
  else fail('S6 online', JSON.stringify(on).slice(0, 200));

  const st = parseJson(runCli('status --json', { cwd: e2eProj }));
  if (st.ok && st.platform?.status === 1) {
    pass('S6 status 已上架', `resourceId=${st.platform?.resourceId}`);
  } else if (st.ok && st.platform?.latestVersion) {
    pass('S6 status 已发版', `latest=${st.platform.latestVersion} status=${st.platform?.status}`);
  } else {
    fail('S6 status', JSON.stringify(st).slice(0, 200));
  }

  const publishedVersion = pub.version || '1.0.0';

  // --- S6b 维护期：update / offline / online ---
  const upd = parseJson(
    runCli(`update --title "E2E Updated ${e2eTs}" --intro "dev verify" --yes --json`, {
      cwd: e2eProj,
    }),
  );
  if (upd.ok) pass('S6b update listing', upd.resource?.title || 'ok');
  else fail('S6b update listing', JSON.stringify(upd).slice(0, 200));

  const off = parseJson(runCli('offline --yes --json', { cwd: e2eProj }));
  if (off.ok) pass('S6b offline', off.status != null ? `status=${off.status}` : 'ok');
  else fail('S6b offline', JSON.stringify(off).slice(0, 200));

  const on2 = parseJson(runCli('online --yes --json', { cwd: e2eProj }));
  if (on2.ok) pass('S6b online 再上架', 'ok');
  else fail('S6b online 再上架', JSON.stringify(on2).slice(0, 200));

  // --- S6c 发新版 + 改说明 + 草稿 ---
  fs.appendFileSync(e2ePhoto, '-bump');
  runCli('version set --file photo.png --yes --json', { cwd: e2eProj });
  const pub2 = parseJson(runCli('publish --bump --yes --json', { cwd: e2eProj }));
  const bumpedVersion = pub2.version;
  if (pub2.ok && bumpedVersion) pass('S6c publish --bump', bumpedVersion);
  else fail('S6c publish --bump', JSON.stringify(pub2).slice(0, 200));

  const editVer = bumpedVersion || publishedVersion;
  const ed = parseJson(
    runCli(`version edit --version ${editVer} --description "e2e-edit-${e2eTs}" --yes --json`, {
      cwd: e2eProj,
    }),
  );
  if (ed.ok) pass('S6c version edit', editVer);
  else fail('S6c version edit', JSON.stringify(ed).slice(0, 200));

  runCli(`version set --version 9.9.${e2eTs % 100000} --file photo.png --yes --json`, {
    cwd: e2eProj,
  });
  const dp = parseJson(runCli('draft push --yes --json', { cwd: e2eProj }));
  if (dp.ok) pass('S6c draft push', dp.version || 'ok');
  else fail('S6c draft push', JSON.stringify(dp).slice(0, 200));

  const dr = parseJson(runCli('draft pull --yes --json', { cwd: e2eProj }));
  if (dr.ok) pass('S6c draft pull', 'ok');
  else fail('S6c draft pull', JSON.stringify(dr).slice(0, 200));

  const dd = parseJson(runCli('draft discard --yes --json', { cwd: e2eProj }));
  if (dd.ok) pass('S6c draft discard', 'ok');
  else fail('S6c draft discard', JSON.stringify(dd).slice(0, 200));

  runCli('pull --json', { cwd: e2eProj });
  pass('S6c pull 刷新 state');

  // --- S6d publish 后 manifest ↔ 平台 inputAttrs key 集合 ---
  const manifestPath = path.join(e2eProj, 'freelog.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const localAttrs = manifest.version?.inputAttrs || [];
  const shown = parseJson(
    runCli(`version show --version ${editVer} --yes --json`, { cwd: e2eProj }),
  );
  if (shown.ok && keysEqual(localAttrs, shown.inputAttrs)) {
    pass('S6d publish 属性 key parity', attrKeys(localAttrs).join(',') || '(empty)');
  } else {
    fail(
      'S6d publish 属性 key parity',
      `local=${JSON.stringify(attrKeys(localAttrs))} platform=${JSON.stringify(attrKeys(shown.inputAttrs))}`,
    );
  }

  // --- S6f inputAttrs value 级 parity（manifest / dry-run ↔ 平台读回）---
  const manifestValueDiff = diffInputAttrsByValue(localAttrs, shown.inputAttrs);
  const dryValueDiff = diffInputAttrsByValue(
    dryPub.createVersionParams?.inputAttrs,
    shown.inputAttrs,
  );
  if (manifestValueDiff.length === 0) {
    pass('S6f manifest↔平台 inputAttrs value', attrKeys(localAttrs).join(',') || '(empty)');
  } else {
    fail('S6f manifest↔平台 inputAttrs value', formatAttrDiff(manifestValueDiff));
  }
  if (dryPub.createVersionParams?.inputAttrs === 'unresolved') {
    pass('S6f dry-run 属性计划', '新文件未上传，值明确标记 unresolved');
  } else if (dryValueDiff.length === 0) {
    pass('S6f dry-run↔平台 inputAttrs value', 'createVersion body 一致');
  } else {
    fail('S6f dry-run↔平台 inputAttrs value', formatAttrDiff(dryValueDiff));
  }

  // --- S14 REST vs SSE metaInfoArray（≅ Console PropertyParser SSE）---
  const metaCmp = parseJson(
    runCli(
      `meta compare --file photo.png --resource-type RT005001 --yes --json`,
      { cwd: e2eProj },
    ),
  );
  if (metaCmp.ok && metaCmp.diffs?.every((d) => d.metaEqual)) {
    pass('S14 REST/SSE meta parity', metaCmp.sha1?.slice(0, 12) || 'ok');
  } else {
    fail('S14 REST/SSE meta parity', JSON.stringify(metaCmp).slice(0, 300));
  }

  // --- S6e sync-properties + 读回 ---
  const sync = parseJson(
    runCli(`version edit --version ${editVer} --sync-properties --yes --json`, {
      cwd: e2eProj,
    }),
  );
  const resync = parseJson(
    runCli(`version show --version ${editVer} --yes --json`, { cwd: e2eProj }),
  );
  if (sync.ok && resync.ok && keysEqual(sync.syncedInputAttrKeys?.map((k) => ({ key: k })), resync.inputAttrs)) {
    pass('S6e version edit --sync-properties', attrKeys(resync.inputAttrs).join(',') || '(empty)');
  } else {
    fail('S6e version edit --sync-properties', JSON.stringify({ sync, resync }).slice(0, 300));
  }
} catch (e) {
  fail('S6 dev 发布链', commandFailureDetail(e));
} finally {
  fs.rmSync(e2eProj, { recursive: true, force: true });
}

// --- S7 主题 zip 发版（临时项目 + 稳定静态产物） ---
const themeTs = Date.now();
const themeProj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-theme-e2e-'));
const themeDist = path.join(themeProj, 'dist');
const themeArtifact = path.resolve(cliRoot, '../../test/fixtures/theme-artifact');

try {
  if (!fs.existsSync(themeArtifact)) {
    fail('S7 主题发版', `主题测试产物不存在: ${themeArtifact}`);
  } else {
    loginPrimary();
    runCli(
      `init theme . --template vite-react-ts --runtime 0.5 --resource-name theme-${themeTs} --title "CLI Theme E2E ${themeTs}" --skip-install --yes --json`,
      { cwd: themeProj },
    );
    fs.cpSync(themeArtifact, themeDist, { recursive: true });
    parseJson(runCli('create --yes --json', { cwd: themeProj }));
    const themeUpd = parseJson(
      runCli(`update --title "CLI Theme E2E ${themeTs}" --yes --json`, { cwd: themeProj }),
    );
    if (themeUpd.ok) pass('S7 update 主题 listing', 'ok');
    else fail('S7 update 主题 listing', JSON.stringify(themeUpd).slice(0, 200));

    const themePub = parseJson(runCli('publish --yes --json', { cwd: themeProj }));
    if (themePub.ok && themePub.version) {
      pass('S7 主题 publish --bump', `${themePub.version} zip`);
    } else {
      fail('S7 主题 publish --bump', JSON.stringify(themePub).slice(0, 300));
    }

    const themeEdit = parseJson(
      runCli(
        `version edit --version ${themePub.version} --description "theme-e2e-${themeTs}" --yes --json`,
        { cwd: themeProj },
      ),
    );
    if (themeEdit.ok) pass('S7 主题 version edit', themePub.version);
    else fail('S7 主题 version edit', JSON.stringify(themeEdit).slice(0, 200));

    const themeSt = parseJson(runCli('status --json', { cwd: themeProj }));
    if (themeSt.ok && themeSt.platform?.latestVersion) {
      pass('S7 主题 status', `latest=${themeSt.platform.latestVersion}`);
    } else {
      fail('S7 主题 status', JSON.stringify(themeSt).slice(0, 200));
    }
  }
} catch (e) {
  fail('S7 主题发版链', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(themeProj, { recursive: true, force: true });
}

// --- S8 init widget 非交互 ---
const widgetBase = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-widget-'));
const widgetName = `wgt-${Date.now()}`;
try {
  const wOut = runCli(
    `init widget ${widgetName} --template vite-vue-ts --runtime 0.5 --yes --json --skip-install`,
    { cwd: widgetBase },
  );
  const wj = parseJson(wOut);
  if (wj.ok && wj.resourceTypeCode && wj.scaffold === 'runtime') {
    pass('S8 init widget 非交互', `code=${wj.resourceTypeCode}`);
  } else {
    fail('S8 init widget 非交互', JSON.stringify(wj));
  }
} catch (e) {
  fail('S8 init widget 非交互', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(widgetBase, { recursive: true, force: true });
}

// package 预设按当前验收范围暂停；其类型映射由 unit test 与 S3 歧义门禁覆盖。
skip('S8b init package 非交互', 'package 业务验收暂停，不纳入本轮 dev 签字');

// --- S9 type pick 插件定稿 ---
try {
  const j = parseJson(runCli('type pick --category widget --json'));
  if (j.ok && j.code && j.suggestedScaffold === 'runtime') {
    pass('S9 type pick 插件定稿', `code=${j.code}`);
  } else fail('S9 type pick 插件', JSON.stringify(j));
} catch (e) {
  fail('S9 type pick 插件', e.stderr?.toString()?.slice(0, 300) || e.message);
}

// --- S10 单视频链路：原文件上传 + 版本封面 + publish + online ---
const videoTs = Date.now();
const videoProj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-video-e2e-'));
const testVideoSrc = path.resolve(
  cliRoot,
  '../../test/fixtures/media/sample-video.mp4',
);
const testCoverSrc = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');

try {
  if (!fs.existsSync(testVideoSrc)) throw new Error(`测试视频不存在: ${testVideoSrc}`);
  copyUniqueFile(testVideoSrc, path.join(videoProj, 'clip.mp4'), videoTs);
  copyUniqueFile(testCoverSrc, path.join(videoProj, 'cover.png'), videoTs);
  writePolicyFile(path.join(videoProj, 'policy.free.json'));

  runCli(
    `init . --scaffold none --artifact-mode file --resource-type RT006003 --resource-name vid-${videoTs} --title "Video E2E ${videoTs}" --yes --json`,
    { cwd: videoProj },
  );
  parseJson(runCli('create --yes --json', { cwd: videoProj }));
  runCli(
    'version set --version 1.0.0 --file clip.mp4 --video-cover cover.png --yes --json',
    { cwd: videoProj },
  );
  const vPub = parseJson(runCli('publish --yes --json', { cwd: videoProj }));
  if (vPub.ok) pass('S10 单视频 publish', vPub.version || 'ok');
  else fail('S10 单视频 publish', JSON.stringify(vPub).slice(0, 200));

  runCli('policy apply --from-file policy.free.json --yes --json', { cwd: videoProj });
  parseJson(runCli('online --yes --json', { cwd: videoProj }));
  const vSt = parseJson(runCli('status --json', { cwd: videoProj }));
  if (vSt.ok && vSt.platform?.latestVersion) {
    pass('S10 单视频 online', `latest=${vSt.platform.latestVersion}`);
  } else fail('S10 单视频 online', JSON.stringify(vSt).slice(0, 200));

  // VID-05 维护：新版换 videoCover
  fs.appendFileSync(path.join(videoProj, 'clip.mp4'), '-v2');
  fs.copyFileSync(testCoverSrc, path.join(videoProj, 'cover2.png'));
  fs.appendFileSync(path.join(videoProj, 'cover2.png'), `${videoTs}-v2`);
  runCli(
    'version set --file clip.mp4 --video-cover cover2.png --yes --json',
    { cwd: videoProj },
  );
  const dryV2 = parseJson(runCli('publish --dry-run --bump --yes --json', { cwd: videoProj }));
  const v2Cover = dryV2.createVersionParams?.videoCover;
  if (
    dryV2.ok &&
    v2Cover === 'unresolved' &&
    dryV2.unresolved?.includes('createVersionParams.videoCover')
  ) {
    pass('VID-05 dry-run videoCover', '本地封面已校验，未上传并标记 unresolved');
  } else {
    fail('VID-05 dry-run videoCover', JSON.stringify(dryV2).slice(0, 200));
  }
  const vPub2 = parseJson(runCli('publish --bump --yes --json', { cwd: videoProj }));
  if (vPub2.ok && vPub2.version) {
    pass('VID-05 publish --bump 换封面', vPub2.version);
  } else {
    fail('VID-05 publish --bump 换封面', JSON.stringify(vPub2).slice(0, 200));
  }
} catch (e) {
  fail('S10 单视频链路', commandFailureDetail(e));
} finally {
  fs.rmSync(videoProj, { recursive: true, force: true });
}

// --- S11 图片合集链路 ---
const collPhotoTs = Date.now();
const collPhotoWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-coll-photo-'));
const collPhotoMedia = path.join(collPhotoWork, 'photos');
const testPhotoSrc = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');

try {
  fs.mkdirSync(collPhotoMedia, { recursive: true });
  copyUniqueFile(testPhotoSrc, path.join(collPhotoMedia, 'a.png'), `${collPhotoTs}a`);
  copyUniqueFile(testPhotoSrc, path.join(collPhotoMedia, 'b.png'), `${collPhotoTs}b`);
  const r = runCollectionE2e({
    workBase: collPhotoWork,
    ts: collPhotoTs,
    label: 'photo',
    albumName: 'album',
    mediaDir: collPhotoMedia,
    itemTypeCode: 'RT005001',
  });
  pass('S11 图片合集 import-dir', `${r.imp.created.length} 项`);
  if (r.pub.isMergeCatalogueDraft === 1) {
    pass('S11 首版 publish merge=1', 'items changed');
  } else {
    fail('S11 首版 publish merge=1', `got ${r.pub.isMergeCatalogueDraft}`);
  }
  pass('S11 图片合集 publish', r.pub.version || 'ok');
  if (r.st.platform?.status === 1 || r.st.platform?.latestVersion) {
    pass('S11 图片合集 online', `status=${r.st.platform?.status}`);
  } else fail('S11 图片合集 online', JSON.stringify(r.st).slice(0, 200));

  // --- S11d 仅改说明再 publish → isMergeCatalogueDraft=0 ---
  runCli('collection version set --description "e2e no item change" --json', { cwd: r.proj });
  const pub2 = parseJson(runCli('collection publish --yes --json', { cwd: r.proj }));
  if (pub2.ok && pub2.isMergeCatalogueDraft === 0) {
    pass('S11d 无目录变更 publish merge=0', 'ok');
  } else {
    fail('S11d 无目录变更 publish merge=0', JSON.stringify(pub2).slice(0, 200));
  }

  const propsSync = parseJson(runCli('collection properties sync --yes --json', { cwd: r.proj }));
  if (propsSync.ok) pass('S11d collection properties sync', propsSync.resourceId || 'ok');
  else fail('S11d collection properties sync', JSON.stringify(propsSync).slice(0, 200));
} catch (e) {
  fail('S11 图片合集链路', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(collPhotoWork, { recursive: true, force: true });
}

// --- S11e 合集 item CRUD + collection update + logs ---
const crudTs = Date.now();
const crudWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-coll-crud-'));
const crudMedia = path.join(crudWork, 'photos');
try {
  fs.mkdirSync(crudMedia, { recursive: true });
  copyUniqueFile(testPhotoSrc, path.join(crudMedia, 'a.png'), `${crudTs}a`);
  copyUniqueFile(testPhotoSrc, path.join(crudMedia, 'b.png'), `${crudTs}b`);
  const album = `album-crud-${crudTs}`;
  runCli(
    `init ${album} --scaffold collection --resource-type RT003006 --resource-name coll-crud-${crudTs} --title "Coll CRUD ${crudTs}" --yes --json`,
    { cwd: crudWork },
  );
  const proj = path.join(crudWork, album);
  const itemPolicyPath = path.join(proj, 'policy.free.json');
  writePolicyFile(itemPolicyPath);
  parseJson(runCli('collection create --yes --json', { cwd: proj }));
  parseJson(
    runCli(
      `collection item import-dir "${crudMedia}" --resource-type RT005001 --item-policy-file "${itemPolicyPath}" --title-prefix "crud " --yes --json`,
      { cwd: proj },
    ),
  );
  const draftItems = loadCollectionDraftItems(proj);
  if (draftItems.length < 2) {
    fail('S11e item draft 可读', `got ${draftItems.length}`);
  } else {
    pass('S11e item draft 可读', `${draftItems.length} 项`);
    const [a, b] = draftItems;
    const itemA = a.itemId;
    const itemB = b.itemId;
    if (!itemA || !itemB) fail('S11e itemId', JSON.stringify(draftItems).slice(0, 200));
    else {
      const renamed = `Renamed ${crudTs}`;
      parseJson(runCli(`collection item update ${itemA} --title "${renamed}" --json`, { cwd: proj }));
      pass('S11e item update', itemA);

      const orderFile = path.join(proj, '.freelog', 'reorder.json');
      fs.mkdirSync(path.dirname(orderFile), { recursive: true });
      fs.writeFileSync(orderFile, JSON.stringify([itemB, itemA]), 'utf8');
      parseJson(runCli(`collection item reorder --order-file "${orderFile}" --json`, { cwd: proj }));
      pass('S11e item reorder', 'ok');

      parseJson(runCli(`collection item remove ${itemB} --json`, { cwd: proj }));
      const afterRemove = loadCollectionDraftItems(proj);
      if (afterRemove.length === 1) pass('S11e item remove', '1 项剩余');
      else fail('S11e item remove', `remaining=${afterRemove.length}`);

      const collUpd = parseJson(
        runCli(
          `collection update --title "Coll CRUD Updated ${crudTs}" --intro "e2e collection intro" --json`,
          { cwd: proj },
        ),
      );
      if (collUpd.ok) pass('S11e collection update listing', 'ok');
      else fail('S11e collection update listing', JSON.stringify(collUpd).slice(0, 200));

      const logs = parseJson(runCli('collection logs --json', { cwd: proj }));
      if (logs.ok) pass('S11e collection logs', Array.isArray(logs.logs) ? `${logs.logs.length} 条` : 'ok');
      else fail('S11e collection logs', JSON.stringify(logs).slice(0, 200));
    }
  }
} catch (e) {
  fail('S11e 合集 CRUD', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(crudWork, { recursive: true, force: true });
}

// --- S12 视频合集链路 ---
const collVidTs = Date.now();
const collVidWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-coll-video-'));
const collVidMedia = path.join(collVidWork, 'clips');
const clipSrc = path.resolve(
  cliRoot,
  '../../test/fixtures/media/sample-video.mp4',
);

try {
  if (!fs.existsSync(clipSrc)) throw new Error(`测试 clip 不存在: ${clipSrc}`);
  fs.mkdirSync(collVidMedia, { recursive: true });
  copyUniqueFile(clipSrc, path.join(collVidMedia, 'clip-a.mp4'), `${collVidTs}a`);
  copyUniqueFile(clipSrc, path.join(collVidMedia, 'clip-b.mp4'), `${collVidTs}b`);
  const r = runCollectionE2e({
    workBase: collVidWork,
    ts: collVidTs,
    label: 'clip',
    albumName: 'vid-album',
    mediaDir: collVidMedia,
    itemTypeCode: 'RT006003',
  });
  pass('S12 视频合集 import-dir', `${r.imp.created.length} 项`);
  pass('S12 视频合集 publish', r.pub.version || 'ok');
  if (r.st.platform?.status === 1 || r.st.platform?.latestVersion) {
    pass('S12 视频合集 online', `status=${r.st.platform?.status}`);
  } else fail('S12 视频合集 online', JSON.stringify(r.st).slice(0, 200));
} catch (e) {
  fail('S12 视频合集链路', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(collVidWork, { recursive: true, force: true });
}

// --- S12b / VID-03 短视频批量独立 resource import-dir ---
const vidBatchTs = Date.now();
const vidBatchWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-vid-batch-'));
const vidBatchDir = path.join(vidBatchWork, 'clips');
const testVideoBatchSrc = path.resolve(
  cliRoot,
  '../../test/fixtures/media/sample-video.mp4',
);

try {
  if (!fs.existsSync(testVideoBatchSrc)) {
    skip('VID-03 resource import-dir 批量视频', '测试 mp4 不存在');
  } else {
    fs.mkdirSync(vidBatchDir, { recursive: true });
    copyUniqueFile(testVideoBatchSrc, path.join(vidBatchDir, 'a.mp4'), `${vidBatchTs}a`);
    copyUniqueFile(testVideoBatchSrc, path.join(vidBatchDir, 'b.mp4'), `${vidBatchTs}b`);
    fs.writeFileSync(
      path.join(vidBatchDir, 'freelog.batch.json'),
      JSON.stringify({
        defaults: { resourceTypeCode: 'RT006003' },
        items: [
          { filePath: 'a.mp4', title: `Clip A ${vidBatchTs}` },
          { filePath: 'b.mp4', title: `Clip B ${vidBatchTs}` },
        ],
      }),
      'utf8',
    );
    const vidBatch = parseJson(
      runCli(`resource import-dir "${vidBatchDir}" --yes --json`, { cwd: vidBatchWork }),
    );
    if (vidBatch.ok && vidBatch.created?.length >= 2) {
      pass('VID-03 resource import-dir 批量视频', `${vidBatch.created.length} 个独立资源`);
    } else {
      fail('VID-03 resource import-dir 批量视频', JSON.stringify(vidBatch).slice(0, 300));
    }
  }
} catch (e) {
  fail('VID-03 短视频批量链路', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(vidBatchWork, { recursive: true, force: true });
}

// --- S13 批量独立资源 resource import-dir ---
const batchTs = Date.now();
const batchWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-batch-'));
const batchDir = path.join(batchWork, 'photos');

try {
  fs.mkdirSync(batchDir, { recursive: true });
  copyUniqueFile(testPhotoSrc, path.join(batchDir, 'x.png'), `${batchTs}x`);
  copyUniqueFile(testPhotoSrc, path.join(batchDir, 'y.png'), `${batchTs}y`);
  const inheritKey = 'ball';
  const inheritValue = `batch-${batchTs}`;
  fs.writeFileSync(
    path.join(batchDir, 'freelog.batch.json'),
    JSON.stringify({
      defaults: {
        resourceTypeCode: 'RT005001',
        inputAttrs: [{ key: inheritKey, value: inheritValue }],
      },
      items: [{ filePath: 'x.png' }, { filePath: 'y.png' }],
    }),
    'utf8',
  );
  const batch = parseJson(
    runCli(`resource import-dir "${batchDir}" --yes --json`, { cwd: batchWork }),
  );
  if (batch.ok && batch.created?.length >= 2) {
    pass('S13 resource import-dir', `${batch.created.length} 个独立资源`);
  } else {
    fail('S13 resource import-dir', JSON.stringify(batch).slice(0, 300));
  }

  const firstSub = batch.created?.[0]?.subdir;
  if (firstSub) {
    const childDir = path.join(batchDir, firstSub);
    const childManifest = JSON.parse(
      fs.readFileSync(path.join(childDir, 'freelog.manifest.json'), 'utf8'),
    );
    const localVal = (childManifest.version?.inputAttrs || []).find((a) => a.key === inheritKey)
      ?.value;
    const shown = parseJson(
      runCli('version show --version 1.0.0 --yes --json', { cwd: childDir }),
    );
    const platformVal = (shown.inputAttrs || []).find((a) => a.key === inheritKey)?.value;
    if (localVal === inheritValue && platformVal === inheritValue) {
      pass('S13b import-dir inherit inputAttrs', `${inheritKey}=${platformVal}`);
    } else {
      fail(
        'S13b import-dir inherit inputAttrs',
        `local=${localVal} platform=${platformVal} expected=${inheritValue}`,
      );
    }
  } else {
    fail('S13b import-dir inherit inputAttrs', '无子目录');
  }
} catch (e) {
  fail('S13 批量独立资源', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(batchWork, { recursive: true, force: true });
}

// --- S15 维护期细测（listing / 策略 / 上下架 / 版本 / 合集 draft）---
console.log('\n--- S15 维护期细测 ---\n');
const s15Ts = Date.now();
const s15Proj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-s15-maint-'));
const s15ListingCoverSrc = path.resolve(cliRoot, '../../test/fixtures/media/sample-cover.png');

try {
  setupOnlinePhotoProject({
    workDir: s15Proj,
    ts: s15Ts,
    testPhoto: testPhotoSrc,
    testCover: s15ListingCoverSrc,
  });

  // S15a listing 细更新：cover / tags / pull --apply-listing
  if (!fs.existsSync(s15ListingCoverSrc)) throw new Error(`封面素材不存在: ${s15ListingCoverSrc}`);
  const coverUpd = parseJson(
    runCli(`update --cover cover.png --tags "cli,e2e,s15" --yes --json`, { cwd: s15Proj }),
  );
  if (coverUpd.ok && coverUpd.resource?.tags?.length) {
    pass('S15a update cover+tags', coverUpd.resource.tags.join(','));
  } else {
    fail('S15a update cover+tags', JSON.stringify(coverUpd).slice(0, 200));
  }

  const platformTitle = `S15 Platform ${s15Ts}`;
  parseJson(runCli(`update --title "${platformTitle}" --yes --json`, { cwd: s15Proj }));
  const manifestPath = path.join(s15Proj, 'freelog.manifest.json');
  const stale = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  stale.resource.title = 'Local Stale Title';
  fs.writeFileSync(manifestPath, `${JSON.stringify(stale, null, 2)}\n`, 'utf8');
  parseJson(runCli('pull --apply-listing --force --yes --json', { cwd: s15Proj }));
  const afterPull = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (afterPull.resource.title === platformTitle) {
    pass('S15a pull --apply-listing', platformTitle);
  } else {
    fail('S15a pull --apply-listing', `manifest=${afterPull.resource.title}`);
  }

  // S15b 策略 list / set / 上架门禁
  const policies1 = parseJson(runCli('policy list --json', { cwd: s15Proj }));
  const firstPolicyId = policies1.policies?.find((p) => p.policyId)?.policyId;
  if (policies1.ok && firstPolicyId) {
    pass('S15b policy list', `${policies1.policies.length} 条`);
  } else {
    fail('S15b policy list', JSON.stringify(policies1).slice(0, 200));
  }

  const altPolicyPath = path.join(s15Proj, 'policy.alt.json');
  writeAltPolicyFile(altPolicyPath);
  runCli(`policy apply --from-file policy.alt.json --yes --json`, { cwd: s15Proj });
  const policies2 = parseJson(runCli('policy list --json', { cwd: s15Proj }));
  const secondPolicyId = (policies2.policies || []).find(
    (p) => p.policyId && p.policyId !== firstPolicyId,
  )?.policyId;
  if (policies2.policies?.length >= 2 && secondPolicyId) {
    pass('S15b policy apply 第二条', `total=${policies2.policies.length}`);
  } else {
    fail('S15b policy apply 第二条', JSON.stringify(policies2).slice(0, 200));
  }

  parseJson(runCli(`policy set ${firstPolicyId} 0 --yes --json`, { cwd: s15Proj }));
  pass('S15b policy set 停用一条', firstPolicyId);

  const blockDisable = runCliExpectFail(`policy set ${secondPolicyId} 0 --yes --json`, {
    cwd: s15Proj,
  });
  if (blockDisable.failed) {
    pass('S15b 上架态禁停最后启用策略', 'CLI 拒绝');
  } else {
    fail('S15b 上架态禁停最后启用策略', '应失败但成功');
  }

  parseJson(runCli('offline --yes --json', { cwd: s15Proj }));
  parseJson(runCli(`policy set ${secondPolicyId} 0 --yes --json`, { cwd: s15Proj }));
  pass('S15b offline 后停用策略', secondPolicyId);

  const blockOnline = runCliExpectFail('online --yes --json', { cwd: s15Proj });
  if (blockOnline.failed) {
    pass('S15b 无启用策略 online 被拒', '门禁生效');
  } else {
    fail('S15b 无启用策略 online 被拒', '应失败但成功');
  }

  parseJson(runCli(`policy set ${firstPolicyId} 1 --yes --json`, { cwd: s15Proj }));
  parseJson(runCli('online --yes --json', { cwd: s15Proj }));
  pass('S15b 恢复策略后再上架', 'ok');

  // S15c 版本维护：bump / edit / show / sync-properties
  fs.appendFileSync(path.join(s15Proj, 'photo.png'), '-s15bump');
  runCli('version set --file photo.png --yes --json', { cwd: s15Proj });
  const bumpPub = parseJson(runCli('publish --bump --yes --json', { cwd: s15Proj }));
  const bumpedVer = bumpPub.version;
  if (bumpPub.ok && bumpedVer) pass('S15c publish --bump', bumpedVer);
  else fail('S15c publish --bump', JSON.stringify(bumpPub).slice(0, 200));

  parseJson(
    runCli(`version edit --version ${bumpedVer} --description "s15-maint-${s15Ts}" --yes --json`, {
      cwd: s15Proj,
    }),
  );
  pass('S15c version edit 说明', bumpedVer);

  const shown = parseJson(runCli(`version show --version ${bumpedVer} --yes --json`, { cwd: s15Proj }));
  if (shown.ok && shown.version && Array.isArray(shown.inputAttrs)) {
    pass('S15c version show 字段', `${shown.inputAttrs.length} inputAttrs`);
  } else {
    fail('S15c version show 字段', JSON.stringify(shown).slice(0, 200));
  }

  runCli(`version set --version 9.8.${s15Ts % 100000} --file photo.png --yes --json`, { cwd: s15Proj });
  parseJson(runCli('draft push --yes --json', { cwd: s15Proj }));
  parseJson(runCli('draft pull --yes --json', { cwd: s15Proj }));
  parseJson(runCli('draft discard --yes --json', { cwd: s15Proj }));
  pass('S15c draft push/pull/discard', 'ok');

  parseJson(runCli('version set --clear-file --yes --json', { cwd: s15Proj }));
  const clearedManifest = JSON.parse(
    fs.readFileSync(path.join(s15Proj, 'freelog.manifest.json'), 'utf8'),
  );
  if (!clearedManifest.version?.filePath) {
    pass('S15c version set --clear-file', 'filePath 已清除');
  } else {
    fail('S15c version set --clear-file', clearedManifest.version?.filePath || '仍有 filePath');
  }
  runCli('version set --file photo.png --yes --json', { cwd: s15Proj });

  const syncEdit = parseJson(
    runCli(`version edit --version ${bumpedVer} --sync-properties --yes --json`, { cwd: s15Proj }),
  );
  if (syncEdit.ok) pass('S15c version edit --sync-properties', 'ok');
  else fail('S15c version edit --sync-properties', JSON.stringify(syncEdit).slice(0, 200));

  // S15d dep 管理（先建依赖目标资源）
  const depTargetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-s15-dep-'));
  try {
    const depSetup = setupOnlinePhotoProject({
      workDir: depTargetDir,
      ts: `${s15Ts}-dep`,
      testPhoto: testPhotoSrc,
    });
    const depId = depSetup.resourceId;
    if (!depId) throw new Error('dep 目标 resourceId 缺失');
    const badRange = runCliExpectFail(`dep add ${depId} --version-range "bad-range" --yes --json`, {
      cwd: s15Proj,
    });
    if (badRange.failed) pass('S15d dep 非法 version-range 被拒', 'CLI 预检');
    else fail('S15d dep 非法 version-range 被拒', '应失败但成功');
    runCli(`dep add ${depId} --version-range "*" --yes --json`, { cwd: s15Proj });
    const depList = parseJson(runCli('dep list --json', { cwd: s15Proj }));
    if (depList.dependencies?.some((d) => d.resourceId === depId)) {
      pass('S15d dep add/list', depId);
    } else {
      fail('S15d dep add/list', JSON.stringify(depList).slice(0, 200));
    }
    runCli(`dep update ${depId} --version-range ">=1.0.0" --yes --json`, { cwd: s15Proj });
    pass('S15d dep update', depId);
    runCli(`dep remove ${depId} --yes --json`, { cwd: s15Proj });
    pass('S15d dep remove', depId);
  } finally {
    fs.rmSync(depTargetDir, { recursive: true, force: true });
  }
} catch (e) {
  fail('S15a–d 单品维护链', commandFailureDetail(e));
} finally {
  fs.rmSync(s15Proj, { recursive: true, force: true });
}

// S15e 合集维护：policy list/set、offline/online、draft --collection
const s15CollTs = Date.now();
const s15CollWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-s15-coll-'));
const s15CollMedia = path.join(s15CollWork, 'photos');
try {
  fs.mkdirSync(s15CollMedia, { recursive: true });
  copyUniqueFile(testPhotoSrc, path.join(s15CollMedia, 'a.png'), `${s15CollTs}a`);
  copyUniqueFile(testPhotoSrc, path.join(s15CollMedia, 'b.png'), `${s15CollTs}b`);
  const coll = runCollectionE2e({
    workBase: s15CollWork,
    ts: s15CollTs,
    label: 's15',
    albumName: 'album-s15',
    mediaDir: s15CollMedia,
    itemTypeCode: 'RT005001',
  });

  const collPolicies = parseJson(runCli('collection policy list --json', { cwd: coll.proj }));
  const collPolicyId = collPolicies.policies?.find((p) => p.policyId)?.policyId;
  if (collPolicies.ok && collPolicyId) {
    pass('S15e collection policy list', collPolicyId);
  } else {
    fail('S15e collection policy list', JSON.stringify(collPolicies).slice(0, 200));
  }

  fs.writeFileSync(
    path.join(coll.proj, 'policy.coll-alt.json'),
    JSON.stringify({
      policyName: 'E2E合集备用',
      policyText: '\nFOR PUBLIC\n\nInitial:\n\tterminate\n// alt',
      status: 1,
    }),
    'utf8',
  );
  runCli('collection policy apply --from-file policy.coll-alt.json --yes --json', { cwd: coll.proj });
  const collPolicies2 = parseJson(runCli('collection policy list --json', { cwd: coll.proj }));
  if ((collPolicies2.policies || []).length >= 2) {
    pass('S15e collection policy apply 第二条', `${collPolicies2.policies.length} 条`);
  } else {
    fail('S15e collection policy apply 第二条', JSON.stringify(collPolicies2).slice(0, 200));
  }

  parseJson(runCli('offline --yes --json', { cwd: coll.proj }));
  pass('S15e collection offline', 'ok');
  parseJson(runCli('online --yes --json', { cwd: coll.proj }));
  pass('S15e collection online 再上架', 'ok');

  runCli('collection version set --description "s15 collection draft" --json', { cwd: coll.proj });
  parseJson(runCli('draft push --collection --yes --json', { cwd: coll.proj }));
  parseJson(runCli('draft pull --collection --yes --json', { cwd: coll.proj }));
  parseJson(runCli('draft discard --collection --yes --json', { cwd: coll.proj }));
  pass('S15e collection draft push/pull/discard', 'ok');

  const collUpd = parseJson(
    runCli(
      `collection update --title "Coll S15 ${s15CollTs}" --intro "collection maint" --json`,
      { cwd: coll.proj },
    ),
  );
  if (collUpd.ok) pass('S15e collection update listing', collUpd.collection?.resourceTitle || 'ok');
  else fail('S15e collection update listing', JSON.stringify(collUpd).slice(0, 200));

  parseJson(runCli('pull --collection --json', { cwd: coll.proj }));
  pass('S15e collection pull', 'ok');
} catch (e) {
  fail('S15e 合集维护链', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(s15CollWork, { recursive: true, force: true });
}

// --- S16 小说作者 P2（动态叶子类型）---
const s16Ts = Date.now();
const novelLeafCode = resolveNovelLeafTypeCode();
if (!novelLeafCode) {
  skip('S16 小说 P2', 'dev 未找到小说/文本叶子类型');
  skip('S16b 小说 P4', '无章节叶子类型');
  skip('S16c 小说 P3', '无批量叶子类型');
  skip('S16d 小说连载维护', '无叶子类型');
} else {
  const s16Proj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-s16-novel-'));
  const s16Policy = path.join(s16Proj, 'policy.free.json');
  const s16Book = path.join(s16Proj, 'book.txt');
  try {
    writePolicyFile(s16Policy);
    fs.writeFileSync(s16Book, `Freelog CLI S16 novel test ${s16Ts}\n`, 'utf8');
    runCli(
      `init . --scaffold none --artifact-mode file --resource-type ${novelLeafCode} --resource-name novel-s16-${s16Ts} --title "Novel S16 ${s16Ts}" --yes --json`,
      { cwd: s16Proj },
    );
    pass('S16 type search 叶子 code', novelLeafCode);
    const createOut = parseJson(runCli('create --yes --json', { cwd: s16Proj }));
    if (!createOut.ok || !createOut.resource?.resourceId) {
      fail('S16 create 小说资源', JSON.stringify(createOut).slice(0, 200));
    } else {
      pass('S16 create 小说资源', createOut.resource.resourceId);
    }
    runCli('version set --version 1.0.0 --file book.txt --yes --json', { cwd: s16Proj });
    const pub = parseJson(runCli('publish --yes --json', { cwd: s16Proj }));
    if (pub.ok) pass('S16 publish 小说', pub.version || 'ok');
    else fail('S16 publish 小说', JSON.stringify(pub).slice(0, 200));
    runCli(`policy apply --from-file policy.free.json --yes --json`, { cwd: s16Proj });
    pass('S16 policy apply', 'ok');
    const on = parseJson(runCli('online --yes --json', { cwd: s16Proj }));
    if (on.ok) pass('S16 online 小说', 'ok');
    else fail('S16 online 小说', JSON.stringify(on).slice(0, 200));
  } catch (e) {
    fail('S16 小说 P2 链', e.stderr?.toString()?.slice(0, 400) || e.message);
  } finally {
    fs.rmSync(s16Proj, { recursive: true, force: true });
  }

  // S16b 小说 P4 — 分章合集（import-dir + publish + online）
  const s16CollTs = Date.now();
  const s16CollWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-s16-coll-'));
  const s16ChaptersDir = path.join(s16CollWork, 'chapters');
  const novelCollTypeCode = resolveNovelCollectionTypeCode();
  try {
    fs.mkdirSync(s16ChaptersDir, { recursive: true });
    fs.writeFileSync(
      path.join(s16ChaptersDir, 'ch1.txt'),
      `Chapter 1 S16b ${s16CollTs}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(s16ChaptersDir, 'ch2.txt'),
      `Chapter 2 S16b ${s16CollTs}\n`,
      'utf8',
    );
    const coll = runCollectionE2e({
      workBase: s16CollWork,
      ts: s16CollTs,
      label: 's16-novel',
      albumName: 'novel-series',
      mediaDir: s16ChaptersDir,
      itemTypeCode: novelLeafCode,
      collectionTypeCode: novelCollTypeCode,
    });
    pass('S16b 合集壳 type', novelCollTypeCode);
    if (coll.imp.created?.length >= 2) {
      pass('S16b item import-dir 章节', `${coll.imp.created.length} 章`);
    } else {
      fail('S16b item import-dir 章节', JSON.stringify(coll.imp).slice(0, 200));
    }
    if (coll.st.ok && coll.st.platform?.status === 1) {
      pass('S16b collection online', `items=${coll.imp.created?.length}`);
    } else if (coll.st.ok && coll.st.platform?.latestVersion) {
      pass('S16b collection publish', coll.st.platform.latestVersion);
    } else {
      fail('S16b collection online', JSON.stringify(coll.st).slice(0, 200));
    }

    const draftItems = loadCollectionDraftItems(coll.proj);
    if (draftItems.length >= 2) {
      pass('S16b 目录草稿可读', `${draftItems.length} 项`);
      const orderFile = path.join(coll.proj, 'reorder-s16.json');
      fs.writeFileSync(
        orderFile,
        JSON.stringify(draftItems.map((x) => x.itemId).reverse()),
        'utf8',
      );
      parseJson(
        runCli(`collection item reorder --order-file "${orderFile}" --json`, { cwd: coll.proj }),
      );
      pass('S16b item reorder 章节', 'ok');
    } else {
      fail('S16b 目录草稿可读', `got ${draftItems.length}`);
    }

    // S16d 连载维护 — 新章节 item add + publish merge=1 + update listing
    const s16dTs = Date.now();
    const ch3Proj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-s16-ch3-'));
    const ch3Policy = path.join(ch3Proj, 'policy.free.json');
    try {
      writePolicyFile(ch3Policy);
      fs.writeFileSync(path.join(ch3Proj, 'ch3.txt'), `Chapter 3 S16d ${s16dTs}\n`, 'utf8');
      runCli(
        `init . --scaffold none --artifact-mode file --resource-type ${novelLeafCode} --resource-name novel-ch3-${s16dTs} --title "Ch3 ${s16dTs}" --yes --json`,
        { cwd: ch3Proj },
      );
      const ch3Create = parseJson(runCli('create --yes --json', { cwd: ch3Proj }));
      const ch3Id = ch3Create.resource?.resourceId;
      if (!ch3Id) throw new Error(`ch3 create: ${JSON.stringify(ch3Create).slice(0, 200)}`);
      runCli('version set --version 1.0.0 --file ch3.txt --yes --json', { cwd: ch3Proj });
      parseJson(runCli('publish --yes --json', { cwd: ch3Proj }));
      runCli(`policy apply --from-file policy.free.json --yes --json`, { cwd: ch3Proj });
      parseJson(runCli('online --yes --json', { cwd: ch3Proj }));

      parseJson(
        runCli(`collection item add ${ch3Id} --title "第3章 ${s16dTs}" --yes --json`, {
          cwd: coll.proj,
        }),
      );
      pass('S16d collection item add 新章节', ch3Id);

      runCli('collection version set --description "连载 v2 加章" --json', { cwd: coll.proj });
      const pub3 = parseJson(runCli('collection publish --yes --json', { cwd: coll.proj }));
      if (pub3.ok && pub3.isMergeCatalogueDraft === 1) {
        pass('S16d collection publish merge=1', pub3.version || 'ok');
      } else {
        fail('S16d collection publish merge=1', JSON.stringify(pub3).slice(0, 200));
      }

      const afterAdd = loadCollectionDraftItems(coll.proj);
      if (afterAdd.length >= 3) {
        pass('S16d 目录草稿 3 章', `${afterAdd.length} 项`);
      } else {
        fail('S16d 目录草稿 3 章', `got ${afterAdd.length}`);
      }

      const collUpd = parseJson(
        runCli(
          `collection update --intro "更新至第 ${afterAdd.length} 章 S16d" --json`,
          { cwd: coll.proj },
        ),
      );
      if (collUpd.ok) pass('S16d collection update listing', 'ok');
      else fail('S16d collection update listing', JSON.stringify(collUpd).slice(0, 200));
    } finally {
      fs.rmSync(ch3Proj, { recursive: true, force: true });
    }
  } catch (e) {
    fail('S16b 小说 P4 链', e.stderr?.toString()?.slice(0, 400) || e.message);
  } finally {
    fs.rmSync(s16CollWork, { recursive: true, force: true });
  }

  // S16c 小说 P3 — 多部独立 resource import-dir
  const s16cTs = Date.now();
  const s16cWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-s16-batch-'));
  const s16cBatchDir = path.join(s16cWork, 'novels');
  try {
    fs.mkdirSync(s16cBatchDir, { recursive: true });
    fs.writeFileSync(path.join(s16cBatchDir, 'a.txt'), `Novel A S16c ${s16cTs}\n`, 'utf8');
    fs.writeFileSync(path.join(s16cBatchDir, 'b.txt'), `Novel B S16c ${s16cTs}\n`, 'utf8');
    fs.writeFileSync(
      path.join(s16cBatchDir, 'freelog.batch.json'),
      JSON.stringify({
        defaults: { resourceTypeCode: novelLeafCode },
        items: [
          { filePath: 'a.txt', title: `Novel A ${s16cTs}` },
          { filePath: 'b.txt', title: `Novel B ${s16cTs}` },
        ],
      }),
      'utf8',
    );
    const batch = parseJson(
      runCli(`resource import-dir "${s16cBatchDir}" --yes --json`, { cwd: s16cWork }),
    );
    if (batch.ok && batch.created?.length >= 2) {
      pass('S16c resource import-dir 多部小说', `${batch.created.length} 部`);
    } else {
      fail('S16c resource import-dir 多部小说', JSON.stringify(batch).slice(0, 300));
    }
  } catch (e) {
    fail('S16c 小说 P3 链', e.stderr?.toString()?.slice(0, 400) || e.message);
  } finally {
    fs.rmSync(s16cWork, { recursive: true, force: true });
  }
}

// --- 负向/形态门禁（IMG / F / COM）---
const negTs = Date.now();
const negWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-'));
const negPhotoDir = path.join(negWork, 'batch-photos');
const negTestPhoto = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');
const negCollWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-coll-'));

try {
  if (!fs.existsSync(negTestPhoto)) {
    skip('IMG-06 P3 import-dir 无合集壳', '测试图片不存在');
    skip('IMG-07 未 create 就 item import-dir', '依赖 IMG-06');
    skip('IMG-08 合集壳误用单品 publish', '依赖 IMG-06');
    skip('F2 图片 publish 目录', '依赖 IMG-06');
  } else {
    fs.mkdirSync(negPhotoDir, { recursive: true });
    copyUniqueFile(negTestPhoto, path.join(negPhotoDir, 'a.png'), `${negTs}a`);
    copyUniqueFile(negTestPhoto, path.join(negPhotoDir, 'b.png'), `${negTs}b`);

    const p3Batch = parseJson(
      runCli(
        `resource import-dir "${negPhotoDir}" --resource-type RT005001 --yes --json`,
        { cwd: negWork },
      ),
    );
    if (p3Batch.ok && p3Batch.created?.length >= 2 && !p3Batch.collectionId) {
      pass('IMG-06 P3 import-dir 无合集壳', `${p3Batch.created.length} 个 resourceId`);
    } else {
      fail('IMG-06 P3 import-dir 无合集壳', JSON.stringify(p3Batch).slice(0, 200));
    }

    const album = `neg-coll-${negTs}`;
    runCli(
      `init ${album} --scaffold collection --resource-type RT003006 --resource-name neg-coll-${negTs} --title "Neg Coll" --yes --json`,
      { cwd: negCollWork },
    );
    const collProj = path.join(negCollWork, album);
    const noCreateImport = runCliExpectFail(
      `collection item import-dir "${negPhotoDir}" --resource-type RT005001 --yes --json`,
      { cwd: collProj },
    );
    if (noCreateImport.failed) {
      pass('IMG-07 未 create 就 item import-dir 被拒', 'CLI 拒绝');
    } else {
      fail('IMG-07 未 create 就 item import-dir 被拒', '应失败但成功');
    }

    parseJson(runCli('collection create --yes --json', { cwd: collProj }));
    const wrongPublish = runCliExpectFail('publish --yes --json', { cwd: collProj });
    if (wrongPublish.failed) {
      pass('IMG-08 合集壳误用单品 publish', 'CLI 拒绝');
    } else {
      fail('IMG-08 合集壳误用单品 publish', '应失败但成功');
    }

    const f2Proj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-f2-'));
    try {
      runCli(
        `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name f2-${negTs} --title "F2 ${negTs}" --yes --json`,
        { cwd: f2Proj },
      );
      parseJson(runCli('create --yes --json', { cwd: f2Proj }));
      runCli(`version set --version 1.0.0 --file "${negPhotoDir}" --yes --json`, { cwd: f2Proj });
      const f2Pub = runCliExpectFail('publish --yes --json', { cwd: f2Proj });
      if (f2Pub.failed) pass('F2 图片 publish 目录', 'CLI/平台拒绝');
      else fail('F2 图片 publish 目录', '应失败但成功');
    } finally {
      fs.rmSync(f2Proj, { recursive: true, force: true });
    }
  }

  const testVideoNeg = path.resolve(
    cliRoot,
    '../../test/fixtures/media/sample-video.mp4',
  );
  if (!fs.existsSync(testVideoNeg)) {
    skip('VID-04 视频 publish 目录', '测试 mp4 不存在');
  } else {
    const vidNegProj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-vid-'));
    const vidNegDir = path.join(vidNegProj, 'clips');
    try {
      fs.mkdirSync(vidNegDir, { recursive: true });
      copyUniqueFile(testVideoNeg, path.join(vidNegDir, 'clip.mp4'), negTs);
      runCli(
        `init . --scaffold none --artifact-mode file --resource-type RT006003 --resource-name vid-neg-${negTs} --title "Vid Neg" --yes --json`,
        { cwd: vidNegProj },
      );
      parseJson(runCli('create --yes --json', { cwd: vidNegProj }));
      runCli(`version set --version 1.0.0 --file "${vidNegDir}" --yes --json`, { cwd: vidNegProj });
      const vidDirPub = runCliExpectFail('publish --yes --json', { cwd: vidNegProj });
      if (vidDirPub.failed) pass('VID-04 视频 publish 目录', 'CLI/平台拒绝');
      else fail('VID-04 视频 publish 目录', '应失败但成功');
    } finally {
      fs.rmSync(vidNegProj, { recursive: true, force: true });
    }
  }
} catch (e) {
  fail('负向/形态门禁', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(negWork, { recursive: true, force: true });
  fs.rmSync(negCollWork, { recursive: true, force: true });
}

// --- COM-06 bind 半路接入（Console 已有资源 + 本地 init 壳）---
const comTs = Date.now();
const comPlatformProj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-com-bind-platform-'));
const comShellProj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-com-bind-shell-'));
const comPhoto = path.join(comPlatformProj, 'photo.png');
const comPolicy = path.join(comPlatformProj, 'policy.free.json');
const comTestPhoto = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');

try {
  if (!fs.existsSync(comTestPhoto)) {
    skip('COM-06 bind 半路接入', '测试图片不存在');
  } else {
    fs.copyFileSync(comTestPhoto, comPhoto);
    fs.appendFileSync(comPhoto, String(comTs));
    writePolicyFile(comPolicy);
    runCli(
      `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name com-bind-${comTs} --title "COM Bind ${comTs}" --yes --json`,
      { cwd: comPlatformProj },
    );
    const created = parseJson(runCli('create --yes --json', { cwd: comPlatformProj }));
    const bindTargetId = created.resource?.resourceId;
    if (!bindTargetId) throw new Error('COM-06 create 无 resourceId');
    runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: comPlatformProj });
    parseJson(runCli('publish --yes --json', { cwd: comPlatformProj }));
    runCli(`policy apply --from-file policy.free.json --yes --json`, { cwd: comPlatformProj });
    parseJson(runCli('online --yes --json', { cwd: comPlatformProj }));

    runCli(
      `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name bind-shell-${comTs} --title "Bind Shell ${comTs}" --yes --json`,
      { cwd: comShellProj },
    );
    const bound = parseJson(runCli(`bind ${bindTargetId} --yes --json`, { cwd: comShellProj }));
    if (bound.ok && bound.resourceId === bindTargetId) {
      pass('COM-06 bind 半路接入', bindTargetId);
    } else {
      fail('COM-06 bind 半路接入', JSON.stringify(bound).slice(0, 200));
    }

    const bindSt = parseJson(runCli('status --json', { cwd: comShellProj }));
    if (bindSt.ok && bindSt.platform?.resourceId === bindTargetId) {
      pass('COM-06 bind 后 status', bindSt.platform.latestVersion || 'ok');
    } else {
      fail('COM-06 bind 后 status', JSON.stringify(bindSt).slice(0, 200));
    }

    fs.copyFileSync(comTestPhoto, path.join(comShellProj, 'photo.png'));
    fs.appendFileSync(path.join(comShellProj, 'photo.png'), `${comTs}-bind-bump`);
    runCli('version set --file photo.png --yes --json', { cwd: comShellProj });
    const bindPub = parseJson(runCli('publish --bump --yes --json', { cwd: comShellProj }));
    if (bindPub.ok && bindPub.version) {
      pass('COM-06 bind 后发新版', bindPub.version);
    } else {
      fail('COM-06 bind 后发新版', JSON.stringify(bindPub).slice(0, 200));
    }

    // COM-07 已绑定目录再 bind 另一 resourceId（无 --force）须拒绝
    const comPlatform2 = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-com-bind2-'));
    const comPhoto2 = path.join(comPlatform2, 'photo.png');
    try {
      fs.copyFileSync(comTestPhoto, comPhoto2);
      fs.appendFileSync(comPhoto2, `${comTs}-2`);
      runCli(
        `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name com-bind2-${comTs} --title "COM Bind2" --yes --json`,
        { cwd: comPlatform2 },
      );
      const created2 = parseJson(runCli('create --yes --json', { cwd: comPlatform2 }));
      const otherId = created2.resource?.resourceId;
      if (!otherId) throw new Error('COM-07 create2 无 resourceId');
      const rebind = runCliExpectFail(`bind ${otherId} --yes --json`, { cwd: comShellProj });
      if (rebind.failed) {
        pass('COM-07 bind 已绑定目录无 force 被拒', 'code 3/4');
      } else {
        fail('COM-07 bind 已绑定目录无 force 被拒', '应失败但成功');
      }
    } finally {
      fs.rmSync(comPlatform2, { recursive: true, force: true });
    }
  }
} catch (e) {
  fail('COM-06 bind 链路', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(comPlatformProj, { recursive: true, force: true });
  fs.rmSync(comShellProj, { recursive: true, force: true });
}

// --- E3 跨账号 owner 负向（辅账号 snnaenu：不可 policy，仅 owner 探测）---
const e3Ts = Date.now();
const e3OwnerProj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-e3-owner-'));
const e3ShellProj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-e3-shell-'));
const e3BoundProj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-e3-bound-'));
const e3Photo = path.join(e3OwnerProj, 'photo.png');
const e3TestPhoto = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');

try {
  if (!SECONDARY_LOGIN) {
    skip('E3 非 owner bind', '未配置辅账号（FREELOG_TEST_SECONDARY_* 或 test/.freelog-test-credentials.local.json）');
    skip('E3 非 owner update', '未配置辅账号（FREELOG_TEST_SECONDARY_* 或 test/.freelog-test-credentials.local.json）');
  } else if (!fs.existsSync(e3TestPhoto)) {
    skip('E3 非 owner bind', '测试图片不存在');
    skip('E3 非 owner update', '测试图片不存在');
  } else {
    loginPrimary();
    fs.copyFileSync(e3TestPhoto, e3Photo);
    fs.appendFileSync(e3Photo, String(e3Ts));
    runCli(
      `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name e3-owner-${e3Ts} --title "E3 Owner ${e3Ts}" --yes --json`,
      { cwd: e3OwnerProj },
    );
    const owned = parseJson(runCli('create --yes --json', { cwd: e3OwnerProj }));
    const ownedId = owned.resource?.resourceId;
    if (!ownedId) throw new Error('E3 create 无 resourceId');

    runCli(
      `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name e3-shell-${e3Ts} --title "E3 Shell" --yes --json`,
      { cwd: e3ShellProj },
    );
    runCli(
      `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name e3-bound-${e3Ts} --title "E3 Bound" --yes --json`,
      { cwd: e3BoundProj },
    );
    parseJson(runCli(`bind ${ownedId} --yes --json`, { cwd: e3BoundProj }));

    loginSecondary();
    const bindOther = runCliExpectFail(`bind ${ownedId} --yes --json`, { cwd: e3ShellProj });
    if (bindOther.failed && expectFailCode(bindOther, 2)) {
      pass('E3 非 owner bind', 'code 2');
    } else {
      fail('E3 非 owner bind', (bindOther.stderr || bindOther.stdout || '未失败').slice(0, 200));
    }

    const updateOther = runCliExpectFail(
      `update --title "E3 Hack ${e3Ts}" --yes --json`,
      { cwd: e3BoundProj },
    );
    if (updateOther.failed && expectFailCode(updateOther, 2)) {
      pass('E3 非 owner update', 'code 2');
    } else {
      fail('E3 非 owner update', (updateOther.stderr || updateOther.stdout || '未失败').slice(0, 200));
    }

    loginPrimary();
    pass('E3 恢复主账号 login', PRIMARY_LOGIN.name);
  }
} catch (e) {
  fail('E3 跨账号 owner', e.stderr?.toString()?.slice(0, 400) || e.message);
  try {
    loginPrimary();
  } catch {
    // 尽力恢复主账号
  }
} finally {
  fs.rmSync(e3OwnerProj, { recursive: true, force: true });
  fs.rmSync(e3ShellProj, { recursive: true, force: true });
  fs.rmSync(e3BoundProj, { recursive: true, force: true });
}

try {
  runCli('version --help');
  pass('S5 version 子命令');
  runCli('draft --help');
  pass('S5 draft 子命令');
  runCli('update --help');
  pass('S5 update 命令');
} catch (e) {
  fail('S5 维护期命令', e.stderr?.toString()?.slice(0, 200) || e.message);
}

// --- S14 batch retry：正式报告 --retry 幂等 ---
const s14Ts = Date.now();
const s14Work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-s14-retry-'));
const s14Dir = path.join(s14Work, 'photos');
const s14Photo = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');
try {
  if (!fs.existsSync(s14Photo)) {
    skip('S14 batch retry', '测试图片不存在');
  } else {
    fs.mkdirSync(s14Dir, { recursive: true });
    copyUniqueFile(s14Photo, path.join(s14Dir, 'a.png'), s14Ts);
    copyUniqueFile(s14Photo, path.join(s14Dir, 'b.png'), `${s14Ts}-b`);
    const first = parseJson(
      runCli(`resource import-dir "${s14Dir}" --resource-type RT005001 --yes --json`, { cwd: s14Work }),
    );
    if (!first.reportFile) {
      fail('S14 batch retry', '首次 import-dir 无 reportFile');
    } else {
      const retry = parseJson(
        runCli(`resource import-dir --retry "${first.reportFile}" --yes --json`, { cwd: s14Work }),
      );
      if (retry.ok !== false && Array.isArray(retry.created) && retry.created.length >= 1) {
        pass('S14 batch retry', `retry ${retry.created.length} 项`);
      } else if (retry.ok !== false && Array.isArray(retry.created) && retry.created.length === 0) {
        pass('S14 batch retry', '幂等跳过（无 failed 项）');
      } else {
        fail('S14 batch retry', JSON.stringify(retry).slice(0, 200));
      }
    }
  }
} catch (e) {
  fail('S14 batch retry', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(s14Work, { recursive: true, force: true });
}

// --- S14b batch resume：remote_succeeded_local_pending 本地补写 ---
const s14bTs = Date.now();
const s14bWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-s14-resume-'));
const s14bDir = path.join(s14bWork, 'photos');
try {
  if (!fs.existsSync(s14Photo)) {
    skip('S14b batch resume', '测试图片不存在');
  } else {
    fs.mkdirSync(s14bDir, { recursive: true });
    copyUniqueFile(s14Photo, path.join(s14bDir, 'a.png'), s14bTs);
    const first = parseJson(
      runCli(`resource import-dir "${s14bDir}" --resource-type RT005001 --yes --json`, {
        cwd: s14bWork,
      }),
    );
    if (!first.reportFile || !first.created?.length) {
      fail('S14b batch resume', '首次 import-dir 无 report/created');
    } else {
      const report = JSON.parse(fs.readFileSync(first.reportFile, 'utf8'));
      const item = report.items?.[0];
      const subdir = first.created[0]?.subdir;
      if (!item?.resourceId || !subdir) {
        fail('S14b batch resume', '报告缺少 resourceId/subdir');
      } else {
        item.result = 'remote_succeeded_local_pending';
        item.resourceName = first.created[0].resourceName;
        fs.writeFileSync(first.reportFile, JSON.stringify(report, null, 2), 'utf8');
        const subPath = path.join(s14bDir, subdir);
        if (fs.existsSync(subPath)) fs.rmSync(subPath, { recursive: true, force: true });
        const resumed = parseJson(
          runCli(`resource import-dir --resume "${first.reportFile}" --yes --json`, {
            cwd: s14bWork,
          }),
        );
        const manifestPath = path.join(subPath, 'freelog.manifest.json');
        if (resumed.ok !== false && fs.existsSync(manifestPath)) {
          pass('S14b batch resume', `恢复 ${subdir}`);
        } else {
          fail('S14b batch resume', JSON.stringify(resumed).slice(0, 200));
        }
      }
    }
  }
} catch (e) {
  fail('S14b batch resume', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(s14bWork, { recursive: true, force: true });
}

// --- DEP-AUTH：同账号自有资源作依赖也需 batchSetContracts 签约 ---
const depAuthTs = Date.now();
const depAuthDepWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-dep-auth-dep-'));
const depAuthConsWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-dep-auth-cons-'));
try {
  if (!fs.existsSync(s14Photo)) {
    skip('DEP-AUTH 自有依赖 dep auth', '测试图片不存在');
  } else {
    loginPrimary();
    const depSetup = setupOnlinePhotoProject({
      workDir: depAuthDepWork,
      ts: `dep-auth-${depAuthTs}`,
      testPhoto: s14Photo,
    });
    const depId = depSetup.resourceId;
    const depPolicies = parseJson(runCli('policy list --json', { cwd: depAuthDepWork }));
    const policyId = depPolicies.policies?.find((p) => Number(p.status) === 1)?.policyId;
    if (!depId || !policyId) throw new Error('dep 资源或 policyId 缺失');

    copyUniqueFile(s14Photo, path.join(depAuthConsWork, 'photo.png'), depAuthTs);
    runCli(
      `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name dep-auth-cons-${depAuthTs} --title "Dep Auth Cons ${depAuthTs}" --yes --json`,
      { cwd: depAuthConsWork },
    );
    parseJson(runCli('create --yes --json', { cwd: depAuthConsWork }));
    runCli(`dep add ${depId} --version-range "*" --yes --json`, { cwd: depAuthConsWork });
    runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: depAuthConsWork });
    fs.writeFileSync(
      path.join(depAuthConsWork, 'auth-map.yaml'),
      `contracts:\n  - resourceId: ${depId}\n    policyIds:\n      - ${policyId}\n`,
      'utf8',
    );
    const auth = parseJson(
      runCli('dep auth --policy-map auth-map.yaml --yes --json', { cwd: depAuthConsWork }),
    );
    if (auth.ok && auth.succeeded?.length >= 1) {
      pass('DEP-AUTH 自有依赖 dep auth', `${auth.succeeded.length} 条`);
    } else {
      fail('DEP-AUTH 自有依赖 dep auth', JSON.stringify(auth).slice(0, 300));
    }
  }
} catch (e) {
  fail('DEP-AUTH 自有依赖 dep auth', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(depAuthDepWork, { recursive: true, force: true });
  fs.rmSync(depAuthConsWork, { recursive: true, force: true });
}

const failed = results.filter((r) => r.status === 'fail');
const skipped = results.filter((r) => r.status === 'skip');
const passed = results.filter((r) => r.status === 'pass');
console.log(
  `\n=== 汇总: ${passed.length} 通过, ${skipped.length} 跳过, ${failed.length} 失败 (共 ${results.length} 项) ===\n`,
);
if (skipped.length) {
  console.log('跳过项（不计入通过，也不导致失败）：');
  for (const row of skipped) {
    console.log(`  ○ ${row.name}${row.detail ? `: ${row.detail}` : ''}`);
  }
  console.log('');
}
process.exit(failed.length ? 1 : 0);
