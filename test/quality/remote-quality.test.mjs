import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyRemoteQuality } from '../../scripts/release/remote-quality.mjs';
import { remoteQualityFixture as fixture } from './fixtures/remote-quality.mjs';

const repo = '/repos/freelogfe/freelog-runtime-cli';
const commit = 'a'.repeat(40);
const head = 'c'.repeat(40);
const names = ['ubuntu-latest / Node 20', 'ubuntu-latest / Node 22', 'windows-latest / Node 20', 'windows-latest / Node 22', 'macos-latest / Node 20', 'macos-latest / Node 22', 'Quality summary'];
const candidate = { purpose: 'release', sourceRevision: { commit, tree: 'b'.repeat(40), clean: true } };
async function blocked(mutate, expectedCode) {
  const data = fixture();
  mutate(data);
  const result = await verifyRemoteQuality({ candidate, fetchImpl: data.fetchImpl });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.reasons.some((reason) => reason.code === expectedCode), JSON.stringify(result.reasons));
  return { ...data, result };
}

test('实时审计正例绑定精确源码、官方app、固定attempt、全部job与平台当前审批观察', async () => {
  const data = fixture();
  const result = await verifyRemoteQuality({ candidate, fetchImpl: data.fetchImpl });
  assert.equal(result.scope, 'fixed-source-current-policy');
  assert.equal(result.status, 'PASS', JSON.stringify(result.reasons));
  assert.deepEqual(result.reasons, []);
  assert.equal(result.observations.ci.status, 'PASS', JSON.stringify(result.reasons));
  assert.equal(result.observations.protection.status, 'PASS');
  assert.equal(result.observations.ci.attempt, 2);
  assert.equal(result.observations.ci.jobs.length, 7);
  assert.equal(result.observations.review.currentDecision, 'APPROVED');
  assert.deepEqual(result.observations.review.approverIds, [2, 3]);
  assert.ok(data.calls.includes(`${repo}/rules/branches/dev?per_page=100&page=1`));
  assert.ok(data.calls.includes(`${repo}/check-runs/206`));
  const again = await verifyRemoteQuality({ candidate, fetchImpl: data.fetchImpl, report: result });
  assert.equal(again.observations.ci.status, 'PASS');
  assert.equal(data.calls.filter((path) => path === `${repo}/actions/runs/40`).length, 4, '复查必须重新GET，不能复用本地报告');
});

test('development/脏源码可只读诊断但不能升级；无精确commit在网络前被拒绝', async () => {
  for (const input of [{ ...candidate, purpose: 'development' }, { ...candidate, sourceRevision: { ...candidate.sourceRevision, clean: false } }]) {
    const data = fixture();
    const result = await verifyRemoteQuality({ candidate: input, fetchImpl: data.fetchImpl });
    assert.equal(result.status, 'BLOCKED');
    assert.ok(result.reasons.some((item) => item.code === 'SOURCE_IDENTITY_INVALID'));
    assert.equal(result.observations.ci.status, 'PASS');
  }
  let calls = 0;
  const invalid = await verifyRemoteQuality({ candidate: {}, fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); } });
  assert.equal(invalid.status, 'BLOCKED');
  assert.equal(calls, 0);
});

test('调用者自定义scope/仓库/工作流或手写报告不能改变固定核验契约', async () => {
  const data = fixture();
  const result = await verifyRemoteQuality({ candidate, fetchImpl: data.fetchImpl, scope: 'anything-passes', repository: 'attacker/other',
    requiredJobs: [], report: { status: 'PASS' } });
  assert.equal(result.scope, 'fixed-source-current-policy');
  assert.equal(result.repository, 'freelogfe/freelog-runtime-cli');
  assert.equal(result.observations.ci.jobs.length, 7);
  assert.ok(data.calls.every((path) => path.startsWith(repo) || path === '/apps/github-actions' || path === '/graphql'));
});

test('旧SHA、其它源仓库、PR事件和错误工作流均拒绝，不能凭同名job通过', async () => {
  for (const mutate of [(data) => { data.run.head_sha = 'd'.repeat(40); }, (data) => { data.run.head_repository = { id: 99 }; },
    (data) => { data.run.event = 'pull_request'; }, (data) => { data.run.path = '.github/workflows/untrusted.yml'; }]) {
    await blocked(mutate, 'WORKFLOW_RUN_BINDING');
  }
  await blocked((data) => { data.routes.get(`${repo}/actions/workflows/ci.yml`).state = 'disabled_manually'; }, 'WORKFLOW_IDENTITY');
});

test('矩阵和最终汇总必须各恰一次completed/success，skipped/neutral/cancelled/缺失/重复不能通过', async () => {
  for (const conclusion of ['skipped', 'neutral', 'cancelled', 'failure', null]) {
    await blocked((data) => { data.jobs[0].conclusion = conclusion; }, 'JOB_RESULT');
  }
  await blocked((data) => { data.jobs[6].conclusion = 'skipped'; }, 'JOB_RESULT');
  await blocked((data) => { data.jobs.pop(); data.routes.get(`${repo}/actions/runs/40/attempts/2/jobs?per_page=100&page=1`).total_count = 6; }, 'JOB_SET');
  await blocked((data) => { data.jobs[6].name = data.jobs[0].name; }, 'JOB_SET');
  await blocked((data) => { data.jobs[0].steps[1].conclusion = 'skipped'; }, 'JOB_STEP_RESULT');
});

test('job对应check必须精确绑定SHA、suite、官方app与名称，外部check URL不能被请求', async () => {
  for (const [key, value] of [['head_sha', 'd'.repeat(40)], ['check_suite', { id: 51 }], ['app', { id: 902, slug: 'github-actions' }], ['name', 'same looking name'], ['conclusion', 'neutral']]) {
    await blocked((data) => { data.routes.get(`${repo}/check-runs/200`)[key] = value; }, 'CHECK_BINDING');
  }
  const result = await blocked((data) => { data.jobs[0].check_run_url = 'https://attacker.invalid/check-runs/200'; }, 'CHECK_URL');
  assert.ok(result.calls.every((path) => !path.includes('attacker')));
});

test('固定attempt的jobs完整翻页并拒绝总数变化或截断', async () => {
  const data = fixture();
  data.routes.set(`${repo}/actions/runs/40/attempts/2/jobs?per_page=100&page=1`, { total_count: 7, jobs: data.jobs.slice(0, 3) });
  data.routes.set(`${repo}/actions/runs/40/attempts/2/jobs?per_page=100&page=2`, { total_count: 7, jobs: data.jobs.slice(3) });
  assert.equal((await verifyRemoteQuality({ candidate, fetchImpl: data.fetchImpl })).observations.ci.status, 'PASS');
  await blocked((other) => { other.routes.get(`${repo}/actions/runs/40/attempts/2/jobs?per_page=100&page=1`).total_count = 8; }, 'REMOTE_PAGINATION');
  await blocked((other) => {
    other.routes.set(`${repo}/actions/runs/40/attempts/2/jobs?per_page=100&page=1`, { total_count: 7, jobs: other.jobs.slice(0, 3) });
    other.routes.set(`${repo}/actions/runs/40/attempts/2/jobs?per_page=100&page=2`, { total_count: 6, jobs: other.jobs.slice(3) });
  }, 'REMOTE_PAGINATION');
});

test('关联PR与reviews完整读取第二页，坏JSON/非数组/空job对象分别显式阻断', async () => {
  const data = fixture();
  data.routes.set(`${repo}/commits/${commit}/pulls?per_page=100&page=1`, Array.from({ length: 100 }, (_, index) => ({ number: 1000 + index, base: { ref: 'other' } })));
  data.routes.set(`${repo}/commits/${commit}/pulls?per_page=100&page=2`, [data.pr]);
  data.routes.set(`${repo}/pulls/60/reviews?per_page=100&page=1`, Array.from({ length: 100 }, (_, index) => ({ id: 1000 + index, user: { id: 1000 + index }, state: 'COMMENTED' })));
  data.routes.set(`${repo}/pulls/60/reviews?per_page=100&page=2`, data.reviews);
  assert.equal((await verifyRemoteQuality({ candidate, fetchImpl: data.fetchImpl })).status, 'PASS');
  assert.ok(data.calls.includes(`${repo}/pulls/60/reviews?per_page=100&page=2`));
  await blocked((other) => { other.routes.set(`${repo}/actions/runs/40`, new Response('{broken-json')); }, 'REMOTE_NETWORK');
  await blocked((other) => { other.routes.set(`${repo}/pulls/60/reviews?per_page=100&page=1`, {}); }, 'REMOTE_PAGINATION');
  await blocked((other) => { other.jobs[0] = null; }, 'REMOTE_PAGINATION');
});

test('经典保护及checks来源、strict、管理员、审批数和绕过配置分别拒绝弱化', async () => {
  const mutators = [(data) => { data.protection.required_status_checks.strict = false; },
    (data) => { data.protection.required_status_checks.checks[0].app_id = null; },
    (data) => { data.protection.required_status_checks.checks.push({ context: 'Unverified required check', app_id: 901 }); },
    (data) => { data.protection.enforce_admins.enabled = false; },
    (data) => { data.protection.required_pull_request_reviews.required_approving_review_count = 0; },
    (data) => { data.protection.required_pull_request_reviews.dismiss_stale_reviews = false; },
    (data) => { data.protection.required_pull_request_reviews.require_last_push_approval = false; },
    (data) => { data.protection.required_pull_request_reviews.require_code_owner_reviews = false; },
    (data) => { data.protection.required_pull_request_reviews.bypass_pull_request_allowances.users.push({ id: 1 }); }];
  for (const mutate of mutators) await blocked(mutate, 'BRANCH_PROTECTION');
});

test('保护401仍读取生效rules，不把不可见当不存在；组织规则细节不可证时保留缺项', async () => {
  const result = await blocked((data) => {
    data.routes.set(`${repo}/branches/dev/protection`, { httpStatus: 401 });
    data.routes.set(`${repo}/rules/branches/dev?per_page=100&page=1`, [{ type: 'pull_request', ruleset_source_type: 'Organization', ruleset_source: 'freelogfe', ruleset_id: 70 }]);
    data.routes.set(`${repo}/rulesets/70?includes_parents=true`, { httpStatus: 403 });
  }, 'REMOTE_HTTP');
  assert.equal(result.result.observations.rules[0].ruleset_source_type, 'Organization');
  assert.ok(result.calls.includes(`${repo}/rulesets/70?includes_parents=true`));
});

test('active inherited rules with unchecked parameters cannot hide extra required checks behind classic protection', async () => {
  await blocked((data) => {
    data.routes.set(`${repo}/rules/branches/dev?per_page=100&page=1`, [{ type: 'required_status_checks',
      ruleset_source_type: 'Organization', ruleset_source: 'freelogfe', ruleset_id: 70,
      parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: 'Unverified inherited check', integration_id: 901 }] } }]);
    data.routes.set(`${repo}/rulesets/70?includes_parents=true`, { id: 70, enforcement: 'active', bypass_actors: [] });
  }, 'RULESET_POLICY_UNVERIFIED');
});

test('关联PR必须精确合并到dev与candidate，旧head审批/已撤销/后来反对均不能凑足通过', async () => {
  await blocked((data) => { data.pr.merge_commit_sha = head; }, 'PULL_REQUEST_BINDING');
  await blocked((data) => { data.pr.base.ref = 'main'; }, 'PULL_REQUEST_BINDING');
  await blocked((data) => { data.reviews[0].commit_id = 'd'.repeat(40); }, 'PULL_REQUEST_APPROVALS');
  await blocked((data) => { data.reviews[0].state = 'DISMISSED'; }, 'PULL_REQUEST_APPROVALS');
  await blocked((data) => { data.reviews.push({ ...data.reviews[0], id: 500, state: 'CHANGES_REQUESTED', submitted_at: '2026-10-16T05:15:00Z' }); }, 'PULL_REQUEST_APPROVALS');
  await blocked((data) => { data.reviews[0].user.id = 1; }, 'PULL_REQUEST_APPROVALS');
});

test('平台query错误、空审批决策和错误head不能被HTTP200或本地审批字符串替代', async () => {
  await blocked((data) => { data.routes.set('/graphql', { errors: [{ message: 'not authorized' }] }); }, 'REVIEW_DECISION_UNVERIFIED');
  await blocked((data) => { data.routes.get('/graphql').data.repository.pullRequest.reviewDecision = null; }, 'REVIEW_DECISION_UNVERIFIED');
  await blocked((data) => { data.routes.get('/graphql').data.repository.pullRequest.headRefOid = commit; }, 'REVIEW_DECISION_UNVERIFIED');
});

test('CODEOWNERS读取固定源码并核对官方errors；通用团队所有者由GitHub判定，不自造RBAC裁决', async () => {
  await blocked((data) => { data.routes.get(`${repo}/codeowners/errors?ref=${commit}`).errors.push({ kind: 'Invalid owner' }); }, 'CODEOWNERS_INVALID');
  const data = fixture();
  data.routes.get(`${repo}/contents/.github/CODEOWNERS?ref=${commit}`).content = Buffer.from('# Universal ownership\n* @freelogfe/team\n').toString('base64');
  const result = await verifyRemoteQuality({ candidate, fetchImpl: data.fetchImpl });
  assert.equal(result.observations.codeowners.status, 'PASS');
  assert.ok(!data.calls.some((path) => path.includes('/permission') || path.includes('/events')));
});

test('README-only ownership or ambiguous overrides cannot prove quality-gate coverage', async () => {
  for (const content of ['README.md @reviewer-2\n', '/scripts/ @reviewer-2\n', '*\n', '* @reviewer-2\nscripts/* @different\n',
    '* @reviewer-2\n/scripts/release/\n']) {
    await blocked((data) => {
      data.routes.get(`${repo}/contents/.github/CODEOWNERS?ref=${commit}`).content = Buffer.from(content).toString('base64');
    }, 'CODEOWNERS_COVERAGE_UNVERIFIED');
  }
});

test('网络失败只记录具体路径与失败类型，不泄露异常内容或伪造PASS', async () => {
  const { result } = await blocked((data) => { data.routes.set(repo, new Error('private-token-do-not-print')); }, 'REMOTE_NETWORK');
  assert.ok(!JSON.stringify(result).includes('private-token-do-not-print'));
});

test('CI最终汇总always运行，按固定attempt逐个拒绝非success矩阵与关键步骤', async () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const section = workflow.slice(workflow.indexOf('  quality-summary:'));
  assert.match(section, /if: \$\{\{ always\(\) \}\}/u);
  assert.match(section, /needs: \[offline-quality\]/u);
  const match = section.match(/node --input-type=module <<'NODE'\r?\n([\s\S]+?)\r?\n\s+NODE/u);
  assert.ok(match, '汇总必须真实读取各matrix job，不能只测needs聚合文本');
  const program = match[1].split(/\r?\n/u).map((line) => line.replace(/^          /u, '')).join('\n');
  const execute = new Function('process', 'fetch', `return (async () => { ${program}\n})();`);
  const data = fixture();
  const summaryFetch = async (url) => new Response(JSON.stringify(url.includes('/jobs?') ? { total_count: 7, jobs: data.jobs } : data.run));
  const processFixture = { env: { GITHUB_RUN_ID: '40', GITHUB_RUN_ATTEMPT: '2', MATRIX_RESULT: 'success', GITHUB_TOKEN: 'test-only' } };
  await execute(processFixture, summaryFetch);
  data.jobs[0].conclusion = 'skipped';
  await assert.rejects(execute(processFixture, summaryFetch), /non-success|success|matrix/iu);
  data.jobs[0].conclusion = 'success';
  data.jobs[0].steps[1].conclusion = 'neutral';
  await assert.rejects(execute(processFixture, summaryFetch), /non-success|success|matrix/iu);
});
