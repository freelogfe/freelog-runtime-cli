#!/usr/bin/env node
/** dev 真网专项：单资源依赖声明不再要求 CLI 签约参数，且不会自动生成双方合同。 */
import {
  BlockedError,
  assertNoContracts,
  assertPublishedDependencies,
  choosePoolTarget,
  cleanupProject,
  createPreparedResource,
  draftDeps,
  loginForApi,
  makeContext,
  readJson,
  requireOk,
  runCli,
  testRoot,
} from './dependency-declaration-helpers.mjs';
import path from 'node:path';

const envIndex = process.argv.indexOf('--env');
const env = envIndex >= 0 ? process.argv[envIndex + 1] ?? 'dev' : 'dev';
const ctx = makeContext('dependency-declarations', env);

function assertDraftHas(work, target) {
  if (!draftDeps(work).some((item) => item.resourceId === target.resourceId && item.versionRange === target.range)) {
    throw new Error(`工作稿未写入依赖声明 ${target.resourceId}`);
  }
}

async function verifySource(primary, target, spec) {
  const source = await createPreparedResource(ctx, primary, spec);
  try {
    await assertNoContracts(ctx, `${spec.kind} before`, source.identity.resourceId, 1, target.resourceId);
    requireOk(runCli(ctx, `${spec.kind} dep add declaration`, ['version', 'dep', 'add', target.resourceId, '--range', target.range, '--yes', ...source.envArgs], { cwd: source.work }), 'dep add 声明失败');
    assertDraftHas(source.work, target);
    await assertNoContracts(ctx, `${spec.kind} after add`, source.identity.resourceId, 1, target.resourceId);
    requireOk(runCli(ctx, `${spec.kind} dep add repeat`, ['version', 'dep', 'add', target.resourceId, '--range', target.range, '--yes', ...source.envArgs], { cwd: source.work }), 'dep add repeat 失败');
    await assertNoContracts(ctx, `${spec.kind} after repeat`, source.identity.resourceId, 1, target.resourceId);
    requireOk(runCli(ctx, `${spec.kind} dep range`, ['version', 'dep', 'range', target.resourceId, '--range', target.range, '--yes', ...source.envArgs], { cwd: source.work }), 'dep range 声明失败');
    await assertNoContracts(ctx, `${spec.kind} after range`, source.identity.resourceId, 1, target.resourceId);
    const before = JSON.stringify(draftDeps(source.work));
    requireOk(runCli(ctx, `${spec.kind} dep range invalid`, ['version', 'dep', 'range', target.resourceId, '--range', '^9999.0.0', '--yes', '--json', ...source.envArgs], {
      cwd: source.work,
      expectFailure: true,
      expectIncludes: '这个范围对不上对方已发行的版本',
    }), '非法 range 未拒绝');
    if (JSON.stringify(draftDeps(source.work)) !== before) throw new Error('非法 range 改动了依赖稿');
    await assertNoContracts(ctx, `${spec.kind} after invalid`, source.identity.resourceId, 1, target.resourceId);
    requireOk(runCli(ctx, `${spec.kind} publish 1.0.0`, ['create-version', '--yes', ...source.envArgs], { cwd: source.work }), '无合约首版发布失败');
    await assertPublishedDependencies(ctx, source, [{ resourceId: target.resourceId, versionRange: target.range }], '1.0.0');
    requireOk(runCli(ctx, `${spec.kind} pull update draft`, ['version', 'draft', 'pull', '--yes', ...source.envArgs], { cwd: source.work }), '更新版拉稿失败');
    requireOk(runCli(ctx, `${spec.kind} update 1.1.0`, ['update-version', '--version', '1.1.0', '--yes', ...source.envArgs], { cwd: source.work }), '无合约更新版发布失败');
    await assertPublishedDependencies(ctx, source, [{ resourceId: target.resourceId, versionRange: target.range }], '1.1.0');
  } finally {
    cleanupProject(ctx, source);
  }
}

try {
  if (env !== 'dev') throw new BlockedError('依赖声明专项只允许 --env dev。');
  const credentials = readJson(path.join(testRoot, '.freelog-test-credentials.local.json'));
  const primary = credentials.primary;
  if (!primary?.loginName || !primary?.password) throw new BlockedError('primary 凭据无效。');
  await loginForApi(primary);
  const pool = readJson(path.join(testRoot, '.freelog-test-resource-pool.local.json'));
  const target = await choosePoolTarget(pool, (item) => !String(item.policyName ?? '').includes('付费'), '资源池没有可声明的免费依赖目标。');
  ctx.log(`[api] target=${target.resourceId} ${target.resourceName} range=${target.range}`);
  await verifySource(primary, target, { kind: 'theme' });
  await verifySource(primary, target, { kind: 'image' });
  ctx.finish('PASS');
} catch (error) {
  const result = error instanceof BlockedError ? 'BLOCKED' : 'FAIL';
  ctx.finish(result, error instanceof Error ? error.message : String(error));
  process.exitCode = error instanceof BlockedError ? 3 : 1;
}
