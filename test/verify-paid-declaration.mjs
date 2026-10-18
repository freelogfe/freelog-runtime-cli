#!/usr/bin/env node
/** dev 真网专项：视频资源声明付费依赖不带策略参数，不付款、不签约，前后双方合同为 0。 */
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
const ctx = makeContext('paid-declaration', env);

try {
  if (env !== 'dev') throw new BlockedError('付费依赖声明专项只允许 --env dev。');
  const credentials = readJson(path.join(testRoot, '.freelog-test-credentials.local.json'));
  const primary = credentials.primary;
  if (!primary?.loginName || !primary?.password) throw new BlockedError('primary 凭据无效。');
  await loginForApi(primary);
  const pool = readJson(path.join(testRoot, '.freelog-test-resource-pool.local.json'));
  const target = await choosePoolTarget(pool, (item) => String(item.policyName ?? '').includes('付费'), '资源池没有可声明的付费依赖目标。');
  const source = await createPreparedResource(ctx, primary, { kind: 'video' });
  let completed = false;
  try {
    ctx.log(`[api] paid target=${target.resourceId} ${target.resourceName} range=${target.range}`);
    await assertNoContracts(ctx, 'paid before', source.identity.resourceId, 1, target.resourceId);
    requireOk(runCli(ctx, 'dep add paid declaration', ['version', 'dep', 'add', target.resourceId, '--range', target.range, '--yes', ...source.envArgs], { cwd: source.work }), '付费依赖声明失败');
    if (!draftDeps(source.work).some((item) => item.resourceId === target.resourceId && item.versionRange === target.range)) {
      throw new Error('工作稿未写入付费依赖声明');
    }
    await assertNoContracts(ctx, 'paid after add', source.identity.resourceId, 1, target.resourceId);
    requireOk(runCli(ctx, 'dep add paid repeat', ['version', 'dep', 'add', target.resourceId, '--range', target.range, '--yes', ...source.envArgs], { cwd: source.work }), '付费依赖重复声明失败');
    await assertNoContracts(ctx, 'paid after repeat', source.identity.resourceId, 1, target.resourceId);
    requireOk(runCli(ctx, 'dep range paid declaration', ['version', 'dep', 'range', target.resourceId, '--range', target.range, '--yes', ...source.envArgs], { cwd: source.work }), '付费依赖改范围失败');
    await assertNoContracts(ctx, 'paid after range', source.identity.resourceId, 1, target.resourceId);
    requireOk(runCli(ctx, 'publish paid declaration', ['create-version', '--yes', ...source.envArgs], { cwd: source.work }), '含付费依赖的无合约首版发布失败');
    await assertPublishedDependencies(ctx, source, [{ resourceId: target.resourceId, versionRange: target.range }], '1.0.0');
    requireOk(runCli(ctx, 'pull paid update draft', ['version', 'draft', 'pull', '--yes', ...source.envArgs], { cwd: source.work }), '付费依赖更新版拉稿失败');
    requireOk(runCli(ctx, 'update paid declaration 1.1.0', ['update-version', '--version', '1.1.0', '--yes', ...source.envArgs], { cwd: source.work }), '含付费依赖的无合约更新版发布失败');
    await assertPublishedDependencies(ctx, source, [{ resourceId: target.resourceId, versionRange: target.range }], '1.1.0');
    completed = true;
  } finally {
    cleanupProject(ctx, source, { success: completed });
  }
  ctx.finish('PASS');
} catch (error) {
  const result = error instanceof BlockedError ? 'BLOCKED' : 'FAIL';
  ctx.finish(result, error instanceof Error ? error.message : String(error));
  process.exitCode = error instanceof BlockedError ? 3 : 1;
}
