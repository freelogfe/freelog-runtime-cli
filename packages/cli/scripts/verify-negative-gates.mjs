#!/usr/bin/env node
/**
 * 必测负向与 batch 恢复边界（NEG-*）。用法：node scripts/verify-negative-gates.mjs [--env dev]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHarness, testPhoto } from './lib/verify-harness.mjs';
import { resolveFrozenResourceId } from './lib/test-fixtures.mjs';

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';

const h = createHarness(env);
const { pass, skip, fail, runCli, runCliExpectFail, parseJson, expectFailCode, loginPrimary, copyUniqueFile, writePolicyFile, summarize, assertCliBuilt } = h;

console.log(`\n=== 负向门禁验证 (env=${env}) ===\n`);
assertCliBuilt();

// NEG-01 非 TTY 未显式 env 的写操作（默认 production）
try {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-env-'));
  runCli(
    'init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name neg-env --title "Neg Env" --yes --json',
    { cwd: work },
  );
  const result = runCliExpectFail('create --yes --json', {
    cwd: work,
    includeEnv: false,
    envVars: { FREELOG_ENV: '', FREELOG_DEV: '' },
  });
  if (result.failed && expectFailCode(result, 4)) {
    pass('NEG-01 非 TTY 未显式 env 写操作', 'code 4');
  } else {
    fail('NEG-01 非 TTY 未显式 env 写操作', result.stderr.slice(0, 200) || '未失败');
  }
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('NEG-01 非 TTY 未显式 env 写操作', e.message);
}

// NEG-02 非交互 batch 缺 --yes
try {
  if (!fs.existsSync(testPhoto)) {
    skip('NEG-02 非交互 batch 缺 --yes', '测试图片不存在');
  } else {
    loginPrimary();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-yes-'));
    const dir = path.join(work, 'photos');
    fs.mkdirSync(dir, { recursive: true });
    copyUniqueFile(testPhoto, path.join(dir, 'a.png'), Date.now());
    const result = runCliExpectFail(
      `resource import-dir "${dir}" --resource-type RT005001 --json`,
      { cwd: work },
    );
    if (result.failed && expectFailCode(result, 4)) {
      pass('NEG-02 非交互 batch 缺 --yes', 'code 4');
    } else {
      fail('NEG-02 非交互 batch 缺 --yes', result.stderr.slice(0, 200) || '未失败');
    }
    fs.rmSync(work, { recursive: true, force: true });
  }
} catch (e) {
  fail('NEG-02 非交互 batch 缺 --yes', e.message);
}

// NEG-03 非叶子资源类型（import-dir 路径校验叶子）
try {
  if (!fs.existsSync(testPhoto)) {
    skip('NEG-03 非叶子资源类型', '测试图片不存在');
  } else {
    loginPrimary();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-leaf-'));
    const dir = path.join(work, 'one');
    fs.mkdirSync(dir, { recursive: true });
    copyUniqueFile(testPhoto, path.join(dir, 'a.png'), Date.now());
    const result = runCliExpectFail(
      `resource import-dir "${dir}" --resource-type RT005 --yes --json`,
      { cwd: work },
    );
    if (result.failed && expectFailCode(result, 4)) {
      pass('NEG-03 非叶子资源类型', 'RT005 被拒');
    } else {
      fail('NEG-03 非叶子资源类型', result.stderr.slice(0, 200) || '未失败');
    }
    fs.rmSync(work, { recursive: true, force: true });
  }
} catch (e) {
  fail('NEG-03 非叶子资源类型', e.message);
}

// NEG-04 无正式版本 online
try {
  if (!fs.existsSync(testPhoto)) {
    skip('NEG-04 无正式版本 online', '测试图片不存在');
  } else {
    loginPrimary();
    const ts = Date.now();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-online-'));
    copyUniqueFile(testPhoto, path.join(work, 'photo.png'), ts);
    runCli(
      `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name neg-on-${ts} --title "Neg On" --yes --json`,
      { cwd: work },
    );
    parseJson(runCli('create --yes --json', { cwd: work }));
    runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: work });
    const result = runCliExpectFail('online --yes --json', { cwd: work });
    if (result.failed && expectFailCode(result, 4)) {
      pass('NEG-04 无正式版本 online', 'code 4');
    } else {
      fail('NEG-04 无正式版本 online', result.stderr.slice(0, 200) || '未失败');
    }
    fs.rmSync(work, { recursive: true, force: true });
  }
} catch (e) {
  fail('NEG-04 无正式版本 online', e.message);
}

// NEG-05 上架态停用最后一条策略
try {
  if (!fs.existsSync(testPhoto)) {
    skip('NEG-05 上架态停用最后策略', '测试图片不存在');
  } else {
    loginPrimary();
    const ts = Date.now();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-policy-'));
    const policyPath = path.join(work, 'policy.free.json');
    writePolicyFile(policyPath);
    copyUniqueFile(testPhoto, path.join(work, 'photo.png'), ts);
    runCli(
      `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name neg-pol-${ts} --title "Neg Pol" --yes --json`,
      { cwd: work },
    );
    parseJson(runCli('create --yes --json', { cwd: work }));
    runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: work });
    parseJson(runCli('publish --yes --json', { cwd: work }));
    parseJson(runCli(`policy apply --from-file policy.free.json --yes --json`, { cwd: work }));
    parseJson(runCli('online --yes --json', { cwd: work }));
    const listed = parseJson(runCli('policy list --json', { cwd: work }));
    const policyId =
      listed.policies?.find((p) => Number(p.status) === 1)?.policyId ||
      listed.policies?.[0]?.policyId;
    if (!policyId) {
      fail('NEG-05 上架态停用最后策略', '无 policyId');
    } else {
      const result = runCliExpectFail(`policy set ${policyId} --status 0 --yes --json`, {
        cwd: work,
      });
      if (result.failed && expectFailCode(result, 4)) {
        pass('NEG-05 上架态停用最后策略', 'code 4');
      } else {
        fail('NEG-05 上架态停用最后策略', result.stderr.slice(0, 200) || '未失败');
      }
    }
    fs.rmSync(work, { recursive: true, force: true });
  }
} catch (e) {
  fail('NEG-05 上架态停用最后策略', e.message);
}

// NEG-06 批量报告 env 漂移
try {
  if (!fs.existsSync(testPhoto)) {
    skip('NEG-06 报告 env 漂移', '测试图片不存在');
  } else {
    loginPrimary();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-drift-env-'));
    const dir = path.join(work, 'photos');
    fs.mkdirSync(dir, { recursive: true });
    copyUniqueFile(testPhoto, path.join(dir, 'a.png'), Date.now());
    const first = parseJson(
      runCli(`resource import-dir "${dir}" --resource-type RT005001 --yes --json`, { cwd: work }),
    );
    if (!first.reportFile) {
      fail('NEG-06 报告 env 漂移', '无 reportFile');
    } else {
      const report = JSON.parse(fs.readFileSync(first.reportFile, 'utf8'));
      report.env = 'production';
      fs.writeFileSync(first.reportFile, JSON.stringify(report, null, 2), 'utf8');
      const result = runCliExpectFail(`resource import-dir --resume "${first.reportFile}" --yes --json`, {
        cwd: work,
      });
      if (result.failed) {
        pass('NEG-06 报告 env 漂移', '拒绝 resume');
      } else {
        fail('NEG-06 报告 env 漂移', '应失败但成功');
      }
    }
    fs.rmSync(work, { recursive: true, force: true });
  }
} catch (e) {
  fail('NEG-06 报告 env 漂移', e.message);
}

// NEG-07 remote_outcome_unknown 禁止 resume
try {
  if (!fs.existsSync(testPhoto)) {
    skip('NEG-07 remote_outcome_unknown', '测试图片不存在');
  } else {
    loginPrimary();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-unknown-'));
    const dir = path.join(work, 'photos');
    fs.mkdirSync(dir, { recursive: true });
    copyUniqueFile(testPhoto, path.join(dir, 'a.png'), Date.now());
    const first = parseJson(
      runCli(`resource import-dir "${dir}" --resource-type RT005001 --yes --json`, { cwd: work }),
    );
    if (!first.reportFile) {
      fail('NEG-07 remote_outcome_unknown', '无 reportFile');
    } else {
      const report = JSON.parse(fs.readFileSync(first.reportFile, 'utf8'));
      if (report.items?.[0]) {
        report.items[0].result = 'remote_outcome_unknown';
        fs.writeFileSync(first.reportFile, JSON.stringify(report, null, 2), 'utf8');
      }
      const result = runCliExpectFail(`resource import-dir --resume "${first.reportFile}" --yes --json`, {
        cwd: work,
      });
      if (result.failed) {
        pass('NEG-07 remote_outcome_unknown 禁止 resume', 'CLI 拒绝');
      } else {
        fail('NEG-07 remote_outcome_unknown 禁止 resume', '应失败但成功');
      }
    }
    fs.rmSync(work, { recursive: true, force: true });
  }
} catch (e) {
  fail('NEG-07 remote_outcome_unknown', e.message);
}

// NEG-08 --resume 与 --retry 同时使用
try {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-both-'));
  const fakeReport = path.join(work, '.freelog', 'reports', 'fake.json');
  fs.mkdirSync(path.dirname(fakeReport), { recursive: true });
  fs.writeFileSync(fakeReport, '{}', 'utf8');
  const result = runCliExpectFail(
    `resource import-dir --resume "${fakeReport}" --retry "${fakeReport}" --yes --json`,
    { cwd: work },
  );
  if (result.failed) {
    pass('NEG-08 resume+retry 互斥', 'CLI 拒绝');
  } else {
    fail('NEG-08 resume+retry 互斥', '应失败但成功');
  }
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('NEG-08 resume+retry 互斥', e.message);
}

// NEG-09 batchSignContracts 不完整
try {
  if (!fs.existsSync(testPhoto)) {
    skip('NEG-09 batchSignContracts 不完整', '测试图片不存在');
  } else {
    loginPrimary();
    const ts = Date.now();
    const depWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-dep-'));
    const consWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-cons-'));
    const depDir = path.join(depWork, 'dep');
    fs.mkdirSync(depDir, { recursive: true });
    copyUniqueFile(testPhoto, path.join(depDir, 'dep.png'), `${ts}d`);
    writePolicyFile(path.join(depDir, 'policy.json'));
    fs.writeFileSync(
      path.join(depDir, 'freelog.batch.json'),
      JSON.stringify({
        defaults: { resourceTypeCode: 'RT005001', version: '1.0.0' },
        items: [{ filePath: 'dep.png', resourceTitle: `dep ${ts}` }],
      }),
      'utf8',
    );
    const depBatch = parseJson(
      runCli(`resource import-dir "${depDir}" --resource-type RT005001 --yes --json`, { cwd: depWork }),
    );
    const depId = depBatch.created?.[0]?.resourceId;
    if (!depId) {
      fail('NEG-09 batchSignContracts 不完整', '依赖资源创建失败');
    } else {
      const batchDir = path.join(consWork, 'batch');
      fs.mkdirSync(batchDir, { recursive: true });
      copyUniqueFile(testPhoto, path.join(batchDir, 'main.png'), `${ts}m`);
      fs.writeFileSync(
        path.join(batchDir, 'freelog.batch.json'),
        JSON.stringify({
          defaults: { resourceTypeCode: 'RT005001', version: '1.0.0' },
          items: [
            {
              filePath: 'main.png',
              resourceTitle: `main ${ts}`,
              dependencies: [{ resourceId: depId, versionRange: '*' }],
            },
          ],
        }),
        'utf8',
      );
      const result = runCliExpectFail(
        `resource import-dir "${batchDir}" --resource-type RT005001 --yes --json`,
        { cwd: consWork },
      );
      if (result.failed) {
        pass('NEG-09 batchSignContracts 不完整', '预检拒绝');
      } else {
        fail('NEG-09 batchSignContracts 不完整', '应失败但成功');
      }
    }
    fs.rmSync(depWork, { recursive: true, force: true });
    fs.rmSync(consWork, { recursive: true, force: true });
  }
} catch (e) {
  fail('NEG-09 batchSignContracts 不完整', e.message);
}

// NEG-10 frozen 资源 publish（可选 FREELOG_TEST_FROZEN_RESOURCE_ID）
try {
  const frozenId = resolveFrozenResourceId(env);
  if (!frozenId) {
    skip('NEG-10 frozen 资源 publish', '运行 provision-frozen-fixture 或设置 FREELOG_TEST_FROZEN_RESOURCE_ID');
  } else if (!fs.existsSync(testPhoto)) {
    skip('NEG-10 frozen 资源 publish', '测试图片不存在');
  } else {
    loginPrimary();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-neg-frozen-'));
    copyUniqueFile(testPhoto, path.join(work, 'photo.png'), 'frozen');
    runCli(
      `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name frozen-bind --title "Frozen" --yes --json`,
      { cwd: work },
    );
    parseJson(runCli(`bind ${frozenId} --yes --json`, { cwd: work }));
    runCli('version set --version 9.9.9 --file photo.png --yes --json', { cwd: work });
    const result = runCliExpectFail('publish --yes --json', { cwd: work });
    if (result.failed && expectFailCode(result, 4)) {
      pass('NEG-10 frozen 资源 publish', 'code 4');
    } else {
      fail('NEG-10 frozen 资源 publish', result.stderr.slice(0, 200) || '未失败');
    }
    fs.rmSync(work, { recursive: true, force: true });
  }
} catch (e) {
  fail('NEG-10 frozen 资源 publish', e.message);
}

process.exit(summarize('NEG 汇总') ? 1 : 0);
