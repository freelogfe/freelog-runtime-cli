#!/usr/bin/env node
/**
 * prod 受控 smoke（PROD-*）：只读 status/type + 本地 init validate dry-run。
 * 用法：node scripts/verify-prod-smoke.mjs [--env production]
 *
 * 凭据：FREELOG_PROD_LOGIN_NAME / FREELOG_PROD_PASSWORD，或 test/.freelog-test-credentials.local.json 的 prod 段。
 * 未配置时跳过（exit 0），不阻塞 dev CI。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness, testPhoto } from './lib/verify-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'production' : 'production';
const prodEnv = env === 'prod' ? 'production' : env;

function readProdAccount() {
  const name = process.env.FREELOG_PROD_LOGIN_NAME?.trim();
  const password = process.env.FREELOG_PROD_PASSWORD?.trim();
  if (name && password) return { name, password, source: 'env' };

  const localPath = path.resolve(__dirname, '../../../test/.freelog-test-credentials.local.json');
  if (fs.existsSync(localPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(localPath, 'utf8').replace(/^\uFEFF/, ''));
      const row = raw.prod || raw.production;
      if (row?.loginName && row?.password) {
        return { name: row.loginName.trim(), password: row.password.trim(), source: 'local-file' };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

const h = createHarness(prodEnv);
const { pass, skip, fail, runCli, parseJson, expectEnvelope, summarize, assertCliBuilt } = h;

console.log(`\n=== prod smoke (env=${prodEnv}) ===\n`);
assertCliBuilt();

const account = readProdAccount();
if (!account) {
  skip('PROD smoke 全包', '未配置 FREELOG_PROD_* 或 local.json prod 段');
  summarize('PROD 汇总');
  process.exit(0);
}

try {
  runCli(`login --global --login-name ${account.name} --password ${account.password} --yes`);
  pass('PROD-01 login', account.source);
} catch (e) {
  fail('PROD-01 login', e.stderr?.toString()?.slice(0, 200) || e.message);
  process.exit(summarize('PROD 汇总') ? 1 : 0);
}

try {
  const st = parseJson(runCli('status --json'));
  if (expectEnvelope(st, { ok: true }) && st.loggedIn) {
    pass('PROD-02 status 只读', st.owner?.loginName || 'loggedIn');
  } else {
    fail('PROD-02 status 只读', JSON.stringify(st).slice(0, 200));
  }
} catch (e) {
  fail('PROD-02 status 只读', e.message);
}

try {
  const types = parseJson(runCli('type list --json'));
  if (expectEnvelope(types, { ok: true }) && Array.isArray(types.types) && types.types.length > 0) {
    pass('PROD-03 type list 只读', `${types.types.length} 类型`);
  } else {
    fail('PROD-03 type list 只读', JSON.stringify(types).slice(0, 200));
  }
} catch (e) {
  fail('PROD-03 type list 只读', e.message);
}

try {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-prod-dry-'));
  runCli(
    'init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name prod-smoke-dry --title "Prod Dry" --yes --json',
    { cwd: work },
  );
  if (fs.existsSync(testPhoto)) {
    fs.copyFileSync(testPhoto, path.join(work, 'photo.png'));
    runCli('version set --version 0.0.1 --file photo.png --yes --json', { cwd: work });
  }
  const val = parseJson(runCli('validate --for publish --json', { cwd: work }));
  if (val.ok !== false || Array.isArray(val.errors)) {
    pass('PROD-04 本地 validate（无平台写）', '预检完成');
  } else {
    fail('PROD-04 本地 validate', JSON.stringify(val).slice(0, 200));
  }
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('PROD-04 本地 validate', e.stderr?.toString()?.slice(0, 200) || e.message);
}

process.exit(summarize('PROD 汇总') ? 1 : 0);
