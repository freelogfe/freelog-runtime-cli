#!/usr/bin/env node
/**
 * 验证冻结测试 fixture（不尝试 API 写 status:2 — dev 普通账号会被拒）。
 * 用法：
 *   1. Console 手动冻结一个测试资源
 *   2. 复制 test/.freelog-test-fixtures.local.example.json → .freelog-test-fixtures.local.json 并填 ID
 *   3. node scripts/provision-frozen-fixture.mjs [--env dev]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from './lib/verify-harness.mjs';
import { resolveFrozenResourceId, testFixturesPath } from './lib/test-fixtures.mjs';
import { installToolsLibForNode, FServiceAPI, unwrapData } from '../dist/index.js';

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';

function isFrozenStatus(status) {
  return (Number(status) & 2) === 2;
}

async function main() {
  process.env.FREELOG_ENV = env;
  process.env.FREELOG_DEV = '1';

  const frozenId = resolveFrozenResourceId(env);
  if (!frozenId) {
    console.error(
      [
        '未找到 frozenResourceId。',
        `请复制 ${testFixturesPath.replace('.local.json', '.local.example.json')} → .freelog-test-fixtures.local.json`,
        '或在 Console 冻结资源后设置 FREELOG_TEST_FROZEN_RESOURCE_ID。',
      ].join('\n'),
    );
    process.exit(1);
  }

  const h = createHarness(env);
  h.loginPrimary();

  installToolsLibForNode();
  const envelope = await FServiceAPI.Resource.info({
    resourceIdOrName: frozenId,
    isLoadLatestVersionInfo: 1,
  });
  const info = unwrapData(envelope);
  if (!isFrozenStatus(info?.status)) {
    console.error(`资源 ${frozenId} 当前 status=${info?.status}，不含 freeze bit`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        env,
        frozenResourceId: frozenId,
        resourceName: info?.resourceName,
        status: info?.status,
        fixturePath: fs.existsSync(testFixturesPath) ? testFixturesPath : null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
