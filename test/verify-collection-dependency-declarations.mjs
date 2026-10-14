#!/usr/bin/env node
/** dev 真网专项：合集直接依赖声明不再要求 CLI 策略参数，且不会自动生成双方合同。 */
import {
  BlockedError,
  assertNoContracts,
  assertPublishedDependencies,
  choosePoolTarget,
  cleanupProject,
  collectionDeps,
  createCollectionShell,
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
const ctx = makeContext('collection-dependency-declarations', env);

function assertCollectionDraftHas(work, collectionId, target) {
  if (!collectionDeps(work, collectionId, env).some((item) => item.resourceId === target.resourceId && item.versionRange === target.range)) {
    throw new Error(`合集表单未写入依赖声明 ${target.resourceId}`);
  }
}

async function verifyTarget(source, target, label) {
  await assertNoContracts(ctx, `${label} before`, source.identity.resourceId, 4, target.resourceId);
  requireOk(runCli(ctx, `${label} collection dep add`, ['collection', 'dep', 'add', `id:${target.resourceId}`, '--range', target.range, '--yes', ...source.envArgs], { cwd: source.work }), `${label} add 失败`);
  assertCollectionDraftHas(source.work, source.identity.resourceId, target);
  await assertNoContracts(ctx, `${label} after add`, source.identity.resourceId, 4, target.resourceId);
  requireOk(runCli(ctx, `${label} collection dep repeat`, ['collection', 'dep', 'add', `id:${target.resourceId}`, '--range', target.range, '--yes', ...source.envArgs], { cwd: source.work }), `${label} repeat 失败`);
  await assertNoContracts(ctx, `${label} after repeat`, source.identity.resourceId, 4, target.resourceId);
  requireOk(runCli(ctx, `${label} collection dep range`, ['collection', 'dep', 'range', `id:${target.resourceId}`, '--range', target.range, '--yes', ...source.envArgs], { cwd: source.work }), `${label} range 失败`);
  await assertNoContracts(ctx, `${label} after range`, source.identity.resourceId, 4, target.resourceId);
}

try {
  if (env !== 'dev') throw new BlockedError('合集依赖声明专项只允许 --env dev。');
  const credentials = readJson(path.join(testRoot, '.freelog-test-credentials.local.json'));
  const primary = credentials.primary;
  if (!primary?.loginName || !primary?.password) throw new BlockedError('primary 凭据无效。');
  await loginForApi(primary);
  const pool = readJson(path.join(testRoot, '.freelog-test-resource-pool.local.json'));
  const freeTarget = await choosePoolTarget(pool, (item) => !String(item.policyName ?? '').includes('付费'), '资源池没有可声明的免费依赖目标。');
  const paidTarget = await choosePoolTarget(pool, (item) => String(item.policyName ?? '').includes('付费'), '资源池没有可声明的付费依赖目标。');
  const source = await createCollectionShell(ctx, primary);
  try {
    ctx.log(`[api] free=${freeTarget.resourceId} paid=${paidTarget.resourceId}`);
    await verifyTarget(source, freeTarget, 'free target');
    await verifyTarget(source, paidTarget, 'paid target');
    const expected = collectionDeps(source.work, source.identity.resourceId, env);
    requireOk(runCli(ctx, 'collection publish declarations', ['collection', 'publish', '--include-items', 'no', '--yes', ...source.envArgs], { cwd: source.work }), '无合约合集表单发布失败');
    await assertPublishedDependencies(ctx, source, expected);
  } finally {
    cleanupProject(ctx, source);
  }
  ctx.finish('PASS');
} catch (error) {
  const result = error instanceof BlockedError ? 'BLOCKED' : 'FAIL';
  ctx.finish(result, error instanceof Error ? error.message : String(error));
  process.exitCode = error instanceof BlockedError ? 3 : 1;
}
