/** Synthetic GitHub transport for isolated validator tests only; never evidence for a real candidate. */
import assert from 'node:assert/strict';

const repo = '/repos/freelogfe/freelog-runtime-cli';
const head = 'c'.repeat(40);
const names = ['ubuntu-latest / Node 20', 'ubuntu-latest / Node 22', 'windows-latest / Node 20', 'windows-latest / Node 22', 'macos-latest / Node 20', 'macos-latest / Node 22', 'Quality summary'];
const step = (name) => ({ name, status: 'completed', conclusion: 'success' });

export function remoteQualityFixture({ commit = 'a'.repeat(40) } = {}) {
  const repository = { id: 20, full_name: 'freelogfe/freelog-runtime-cli', html_url: 'https://github.com/freelogfe/freelog-runtime-cli' };
  const workflow = { id: 30, path: '.github/workflows/ci.yml', state: 'active' };
  const run = { id: 40, workflow_id: 30, path: workflow.path, run_attempt: 2, check_suite_id: 50,
    repository, head_repository: repository, head_sha: commit, head_branch: 'dev', event: 'push', status: 'completed', conclusion: 'success' };
  const jobs = names.map((name, index) => ({ id: 100 + index, run_id: 40, run_attempt: 2, head_sha: commit, head_branch: 'dev', name,
    status: 'completed', conclusion: 'success', check_run_url: `https://api.github.com${repo}/check-runs/${200 + index}`,
    steps: index < 6 ? [step('Install locked dependencies'), step('Offline quality gates')] : [step('Require all matrix results')] }));
  const protection = { required_status_checks: { strict: true, checks: names.map((context) => ({ context, app_id: 901 })) },
    enforce_admins: { enabled: true }, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false },
    required_pull_request_reviews: { required_approving_review_count: 2, dismiss_stale_reviews: true, require_last_push_approval: true,
      require_code_owner_reviews: true, bypass_pull_request_allowances: { users: [], teams: [], apps: [] } } };
  const pr = { number: 60, state: 'closed', merged: true, merge_commit_sha: commit, merged_at: '2026-10-16T05:20:00Z',
    user: { id: 1, login: 'author' }, base: { ref: 'dev', repo: repository }, head: { ref: 'quality-change', sha: head, repo: repository } };
  const reviews = [2, 3].map((id) => ({ id: 300 + id, user: { id, login: `reviewer-${id}`, type: 'User' }, state: 'APPROVED', commit_id: head, submitted_at: '2026-10-16T05:10:00Z' }));
  const routes = new Map([
    [repo, repository], [`${repo}/branches/dev`, { name: 'dev', commit: { sha: commit }, protected: true }],
    ['/apps/github-actions', { id: 901, slug: 'github-actions', owner: { login: 'github' } }],
    [`${repo}/branches/dev/protection`, protection], [`${repo}/rules/branches/dev?per_page=100&page=1`, []],
    [`${repo}/actions/workflows/ci.yml`, workflow],
    [`${repo}/actions/runs?head_sha=${commit}&per_page=100&page=1`, { total_count: 1, workflow_runs: [run] }],
    [`${repo}/actions/runs/40`, run], [`${repo}/actions/runs/40/attempts/2/jobs?per_page=100&page=1`, { total_count: 7, jobs }],
    [`${repo}/commits/${commit}/pulls?per_page=100&page=1`, [pr]], [`${repo}/pulls/60`, pr],
    [`${repo}/pulls/60/reviews?per_page=100&page=1`, reviews],
    [`${repo}/contents/.github/CODEOWNERS?ref=${commit}`, { type: 'file', path: '.github/CODEOWNERS', encoding: 'base64', content: Buffer.from('* @reviewer-2 @reviewer-3\n').toString('base64') }],
    [`${repo}/codeowners/errors?ref=${commit}`, { errors: [] }],
    ['/graphql', { data: { repository: { databaseId: 20, pullRequest: { number: 60, headRefOid: head, baseRefName: 'dev', merged: true,
      mergeCommit: { oid: commit }, reviewDecision: 'APPROVED' } } } }],
    ...jobs.map((job, index) => [`${repo}/check-runs/${200 + index}`, { id: 200 + index, name: job.name, head_sha: commit,
      check_suite: { id: 50 }, app: { id: 901, slug: 'github-actions' }, status: 'completed', conclusion: 'success' }]),
  ]);
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.github.com');
    assert.equal(options.method, parsed.pathname === '/graphql' ? 'POST' : 'GET');
    if (parsed.pathname === '/graphql') {
      const { query } = JSON.parse(options.body);
      assert.match(query, /^query\b/u);
      assert.ok(!query.includes('mutation'));
    }
    assert.equal(options.redirect, 'error');
    const key = parsed.pathname + parsed.search;
    calls.push(key);
    assert.ok(routes.has(key), `unexpected GET ${key}`);
    const body = routes.get(key);
    if (body instanceof Error) throw body;
    if (body instanceof Response) return body.clone();
    if (body?.httpStatus) return new Response(JSON.stringify({ message: 'not included in observations' }), { status: body.httpStatus });
    return new Response(JSON.stringify(body));
  };
  return { routes, calls, fetchImpl, run, jobs, protection, reviews, pr };
}

