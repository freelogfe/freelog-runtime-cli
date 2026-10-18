import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixedTemplateSamples, SampleUnavailableError } from '../acceptance/template-samples.mjs';

const template = (id, parameters = [1, 2]) => ({ id, title: id, parameters });

test('collection sample set is fixed before writes and never replaced by another success', () => {
  const selected = fixedTemplateSamples([template('C'), template('A'), template('B')], 1, (value) => value);
  assert.deepEqual(selected.map((item) => item.template.id), ['A', 'B']);
  assert.equal(selected.length, 2);
});

test('unsupported selected parameter is not silently filtered in favor of another template', () => {
  assert.throws(() => fixedTemplateSamples([template('A', ['unsupported', 1, 2]), template('B'), template('C')], 1, (value) => {
    if (value === 'unsupported') throw new Error('Unsupported selected parameter');
    return value;
  }), /Unsupported selected parameter/u);
  assert.throws(() => fixedTemplateSamples([template('A')], 1, (value) => value), SampleUnavailableError);
});

test('field-rule regression cannot omit a failed record or unconditionally pass self-dependency', () => {
  const source = readFileSync(new URL('../verify-field-rules.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.ok\s*&&\s*record/u);
  assert.doesNotMatch(source, /record\([^\n]*,\s*true\s*\)/u);
  assert.match(source, /record\('§4 不能依赖自己',\s*runCli\([^\n]*\)\.ok\)/u);
  assert.match(source, /const pass = matchesCommandResult\(res, expectErr, err\)/u);
});

test('all legacy dev script entries resolve the selected candidate instead of hardcoding workspace dist', () => {
  for (const file of ['run-all-scenarios.mjs', 'verify-commands.mjs', 'verify-collection-policy.mjs', 'verify-policy-template-tty.mjs',
    'verify-scenarios.mjs', 'verify-field-rules.mjs', 'dependency-declaration-helpers.mjs', 'run-resource-pool-scenarios.mjs',
    'verify-optional-config.mjs', 'verify-theme-image-full-lifecycle.mjs', 'verify-multi-resource-tty.mjs', 'verify-draft-safety.mjs']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    // A producer may defer resolution into its reporting try block so a missing bin is
    // reported for every owned case. Declaration style is not the candidate contract.
    assert.match(source, /\b(?:cliBin|cli)\s*=\s*resolveCliBin\(repoRoot\)/u, file);
    assert.doesNotMatch(source, /\b(?:cliBin|cli)\s*=\s*path\.(?:join|resolve)\s*\([^;]{0,240}['"]dist['"]/u, file);
  }
});

test('TTY probe resolves prompts relative to selected CLI and orchestrator does not parse stdout for responsibility', () => {
  const driver = readFileSync(new URL('../tty-driver.mjs', import.meta.url), 'utf8');
  assert.match(driver, /createRequire\(pathToFileURL\(resolveCliBin\(cwd\)\)\)\.resolve\('@inquirer\/prompts'\)/u);
  const orchestrator = readFileSync(new URL('../run-final-acceptance.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(orchestrator, /RelativeTimeEvent|TransactionEvent|已获授权，跳过|!\/跳过\//u);
  assert.match(orchestrator, /processResult\(child\)/u);
});

test('every dev workspace build uses a strict package filter', () => {
  for (const file of ['run-all-scenarios.mjs', 'run-final-acceptance.mjs', 'discover-optional-config.mjs',
    'verify-collection-policy.mjs', 'verify-commands.mjs', 'verify-draft-safety.mjs', 'verify-existing-resource-policy.mjs',
    'verify-field-rules.mjs', 'verify-multi-resource-tty.mjs', 'verify-optional-config.mjs', 'verify-scenarios.mjs',
    'verify-theme-image-full-lifecycle.mjs']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /spawnSync\('pnpm', \['--fail-if-no-match', '--filter', '@freelog-cli\/cli2', 'build'\]/u, file);
    assert.doesNotMatch(source, /spawnSync\('pnpm', \['--filter'/u, file);
  }
});

test('aggregate plan is read-only and invalid candidate/environment/build combinations fail before any suite', () => {
  const runner = fileURLToPath(new URL('../run-final-acceptance.mjs', import.meta.url));
  const cleanEnv = { ...process.env };
  delete cleanEnv.FREELOG_TEST_CLI_BIN;
  delete cleanEnv.FREELOG_TEST_CANDIDATE_MODE;
  const plan = spawnSync(process.execPath, [runner, '--plan'], { env: cleanEnv, encoding: 'utf8', timeout: 20_000 });
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).releaseEvidence, false);
  for (const args of [['--env', 'prod'], ['--candidate', 'missing-candidate'], ['--candidate', 'missing-candidate', '--skip-build']]) {
    const result = spawnSync(process.execPath, [runner, ...args], { env: cleanEnv, encoding: 'utf8', timeout: 20_000 });
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.doesNotMatch(result.stdout, /legacy process evidence only/u);
  }
});
