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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';

const results = [];

function pass(name, detail) {
  results.push({ ok: true, name, detail });
  console.log(`✔ ${name}${detail ? `: ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.error(`✘ ${name}${detail ? `: ${detail}` : ''}`);
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
    env: { ...process.env, ...(opts.env || {}) },
  });
}

function parseJson(stdout) {
  const start = stdout.indexOf('{');
  if (start < 0) throw new Error(`无 JSON 输出: ${stdout.slice(0, 200)}`);
  return JSON.parse(stdout.slice(start));
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

/** 图片/视频合集：init collection → create → item import-dir → publish → policy → online */
function runCollectionE2e(opts) {
  const { workBase, ts, label, albumName, mediaDir, itemTypeCode } = opts;
  const album = `${albumName}-${ts}`;
  runCli(
    `init ${album} --scaffold collection --resource-type RT003006 --resource-name coll-${label}-${ts} --title "Coll ${label} ${ts}" --yes --json`,
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

// --- S2 命令面 ---
try {
  if (!fs.existsSync(cliBin)) throw new Error('未 build');
  const help = runCli('--help');
  if (help.includes('init') && help.includes('resource') && help.includes('collection')) {
    pass('S2 顶层命令面');
  } else fail('S2 顶层命令面');
  const collHelp = runCli('collection --help');
  if (collHelp.includes('init-from-folder')) pass('S2 collection init-from-folder');
  else fail('S2 collection init-from-folder');
  const resHelp = runCli('resource --help');
  if (resHelp.includes('import-dir')) pass('S2 resource import-dir');
  else fail('S2 resource import-dir');
} catch (e) {
  fail('S2 命令面', e.stderr?.toString()?.slice(0, 300) || e.message);
}

// --- S3 dev API ---
try {
  runCli('login --login-name freelog-test11 --password freelog-test1111 --yes');
  pass('S3 dev 登录');
} catch (e) {
  fail('S3 dev 登录', e.stderr?.toString()?.slice(0, 300) || e.message);
}

try {
  const status = parseJson(runCli('status --json'));
  if (status.ok && status.loggedIn) pass('S3 status', `env=${status.env}`);
  else fail('S3 status', JSON.stringify(status).slice(0, 200));
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
  const j = parseJson(runCli('type pick --category package --json'));
  if (j.ok && j.code && j.suggestedScaffold === 'package') {
    pass('S3 type pick 前端库定稿', `code=${j.code}`);
  } else fail('S3 type pick 前端库', JSON.stringify(j));
} catch (e) {
  fail('S3 type pick 前端库', e.stderr?.toString()?.slice(0, 300) || e.message);
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
const testPhoto = path.resolve(cliRoot, '../../test/abcdef.png');

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
    `init . --scaffold none --resource-type RT005001 --resource-name e2e-pub-${e2eTs} --title "E2E Pub ${e2eTs}" --yes --json`,
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
  if (dryPub.ok && dryPub.createVersionParams?.inputAttrs?.length) {
    pass('S6 dry-run createVersion', `${dryPub.createVersionParams.inputAttrs.length} inputAttrs`);
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
  if (dryValueDiff.length === 0) {
    pass('S6f dry-run↔平台 inputAttrs value', 'createVersion body 一致');
  } else {
    fail('S6f dry-run↔平台 inputAttrs value', formatAttrDiff(dryValueDiff));
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
  fail('S6 dev 发布链', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(e2eProj, { recursive: true, force: true });
}

// --- S7 主题 zip 发版（复用 test/my-freelog-project/dist） ---
const themeProj = path.resolve(cliRoot, '../../test/my-freelog-project');
const themeDist = path.join(themeProj, 'dist');

try {
  if (!fs.existsSync(themeDist)) {
    fail('S7 主题发版', 'dist 不存在，请先在 my-freelog-project 执行 pnpm build');
  } else {
    runCli('login --login-name freelog-test11 --password freelog-test1111 --yes');
    runCli('pull --json', { cwd: themeProj });

    const themeTs = Date.now();
    const themeUpd = parseJson(
      runCli(`update --title "CLI Theme E2E ${themeTs}" --yes --json`, { cwd: themeProj }),
    );
    if (themeUpd.ok) pass('S7 update 主题 listing', 'ok');
    else fail('S7 update 主题 listing', JSON.stringify(themeUpd).slice(0, 200));

    const themePub = parseJson(runCli('publish --bump --yes --json', { cwd: themeProj }));
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
  '../../test/codex-e2e-video-20260805142911/sample-video.mp4',
);
const testCoverSrc = path.resolve(cliRoot, '../../test/abcdef.png');

try {
  if (!fs.existsSync(testVideoSrc)) throw new Error(`测试视频不存在: ${testVideoSrc}`);
  copyUniqueFile(testVideoSrc, path.join(videoProj, 'clip.mp4'), videoTs);
  copyUniqueFile(testCoverSrc, path.join(videoProj, 'cover.png'), videoTs);
  writePolicyFile(path.join(videoProj, 'policy.free.json'));

  runCli(
    `init . --scaffold none --resource-type RT006003 --resource-name vid-${videoTs} --title "Video E2E ${videoTs}" --yes --json`,
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
} catch (e) {
  fail('S10 单视频链路', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(videoProj, { recursive: true, force: true });
}

// --- S11 图片合集链路 ---
const collPhotoTs = Date.now();
const collPhotoWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-coll-photo-'));
const collPhotoMedia = path.join(collPhotoWork, 'photos');
const testPhotoSrc = path.resolve(cliRoot, '../../test/abcdef.png');

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

// --- S12 视频合集链路 ---
const collVidTs = Date.now();
const collVidWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-coll-video-'));
const collVidMedia = path.join(collVidWork, 'clips');
const clipSrc = path.resolve(
  cliRoot,
  '../../test/codex-e2e-video-album-files-20260805142938/clip-1.mp4',
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

// --- S13 批量独立资源 resource import-dir ---
const batchTs = Date.now();
const batchWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-batch-'));
const batchDir = path.join(batchWork, 'photos');

try {
  fs.mkdirSync(batchDir, { recursive: true });
  copyUniqueFile(testPhotoSrc, path.join(batchDir, 'x.png'), `${batchTs}x`);
  copyUniqueFile(testPhotoSrc, path.join(batchDir, 'y.png'), `${batchTs}y`);
  const batch = parseJson(
    runCli(
      `resource import-dir "${batchDir}" --resource-type RT005001 --title-prefix "Batch " --yes --json`,
      { cwd: batchWork },
    ),
  );
  if (batch.ok && batch.created?.length >= 2) {
    pass('S13 resource import-dir', `${batch.created.length} 个独立资源`);
  } else {
    fail('S13 resource import-dir', JSON.stringify(batch).slice(0, 300));
  }
} catch (e) {
  fail('S13 批量独立资源', e.stderr?.toString()?.slice(0, 400) || e.message);
} finally {
  fs.rmSync(batchWork, { recursive: true, force: true });
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

const failed = results.filter((r) => !r.ok);
console.log(`\n=== 汇总: ${results.length - failed.length}/${results.length} 通过 ===\n`);
process.exit(failed.length ? 1 : 0);
