/** Live GitHub observations under the current policy; not a historical permissions audit. */
import { createHash } from 'node:crypto';

const API = 'https://api.github.com';
const REPOSITORY = 'freelogfe/freelog-runtime-cli';
const ROOT = `/repos/${REPOSITORY}`;
const BRANCH = 'dev';
const WORKFLOW = '.github/workflows/ci.yml';
const JOBS = Object.freeze(['ubuntu-latest / Node 20', 'ubuntu-latest / Node 22', 'windows-latest / Node 20',
  'windows-latest / Node 22', 'macos-latest / Node 20', 'macos-latest / Node 22', 'Quality summary']);
const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const success = (value) => value?.status === 'completed' && value.conclusion === 'success';
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);

export async function verifyRemoteQuality({ candidate, fetchImpl = globalThis.fetch } = {}) {
  const reasons = [];
  const observations = { requests: [], ci: { status: 'NOT_TESTED' }, protection: { status: 'NOT_TESTED' },
    review: { status: 'NOT_TESTED' }, codeowners: { status: 'NOT_TESTED' }, rules: [] };
  const commit = candidate?.sourceRevision?.commit;
  const add = (scope, code, detail) => reasons.push({ scope, code, detail });
  const finish = (scope) => { observations[scope].status = reasons.some((item) => item.scope === scope) ? 'BLOCKED' : 'PASS'; };
  const result = () => ({ scope: 'fixed-source-current-policy', status: reasons.length ? 'BLOCKED' : 'PASS',
    checkedAt: new Date().toISOString(), repository: REPOSITORY, branch: BRANCH, commit, observations, reasons,
    limitations: ['Current GitHub policy and computed review state do not reconstruct permissions or bypass history at merge time.',
      'Source CI is not same-tarball platform installation or complete business acceptance.'] });
  if (candidate?.purpose !== 'release' || candidate?.sourceRevision?.clean !== true || !sha(commit) || !sha(candidate?.sourceRevision?.tree)) {
    add('source', 'SOURCE_IDENTITY_INVALID', 'A release candidate with a fixed clean commit/tree is required.');
    if (!sha(commit) || !sha(candidate?.sourceRevision?.tree)) return result();
  }

  // Existing credentials may supply read access. No login, token persistence or credential output.
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  async function request(endpoint, scope, { query, optional404 = false } = {}) {
    const method = query ? 'POST' : 'GET';
    try {
      const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'freelog-runtime-cli-quality' };
      if (token) headers.authorization = `Bearer ${token}`;
      if (query) headers['content-type'] = 'application/json';
      const response = await fetchImpl(`${API}${endpoint}`, { method, headers, redirect: 'error',
        signal: AbortSignal.timeout(15_000), ...(query ? { body: JSON.stringify(query) } : {}) });
      observations.requests.push({ method, endpoint, httpStatus: response.status });
      if (!response.ok) {
        if (!(optional404 && response.status === 404)) add(scope, 'REMOTE_HTTP', `${method} ${endpoint}: HTTP ${response.status}; permission, absence or rate-limit cause is not inferred.`);
        return null;
      }
      return await response.json();
    } catch {
      // Remote errors may contain credential-bearing URLs. Preserve only the fixed request location.
      add(scope, 'REMOTE_NETWORK', `${method} ${endpoint}: network, timeout or JSON response failure.`);
      return null;
    }
  }

  async function list(endpoint, scope, key) {
    const items = [];
    let total;
    for (let page = 1; page <= 20; page += 1) {
      const payload = await request(`${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`, scope);
      if (!payload) {
        if (items.length) add(scope, 'REMOTE_PAGINATION', `${endpoint}: a later page is unavailable.`);
        return null;
      }
      const batch = key ? payload[key] : payload;
      if (!Array.isArray(batch) || !batch.every((item) => item && typeof item === 'object' && !Array.isArray(item))
        || (key && (!Number.isSafeInteger(payload.total_count) || payload.total_count < 0
        || (total !== undefined && total !== payload.total_count)))) {
        add(scope, 'REMOTE_PAGINATION', `${endpoint}: malformed or changing page totals.`); return null;
      }
      if (key) total = payload.total_count;
      items.push(...batch);
      if (key && (items.length > total || (batch.length === 0 && items.length < total))) break;
      if (key ? items.length === total : batch.length < 100) return items;
    }
    add(scope, 'REMOTE_PAGINATION', `${endpoint}: incomplete or excessive pagination.`);
    return null;
  }

  const [repository, branch, app, protection, rules, workflow, runs] = await Promise.all([
    request(ROOT, 'source'), request(`${ROOT}/branches/${BRANCH}`, 'source'), request('/apps/github-actions', 'ci'),
    request(`${ROOT}/branches/${BRANCH}/protection`, 'protection'), list(`${ROOT}/rules/branches/${BRANCH}`, 'protection'),
    request(`${ROOT}/actions/workflows/ci.yml`, 'ci'), list(`${ROOT}/actions/runs?head_sha=${commit}`, 'ci', 'workflow_runs'),
  ]);
  if (!positiveId(repository?.id) || repository?.full_name !== REPOSITORY || repository?.html_url !== `https://github.com/${REPOSITORY}`
    || branch?.name !== BRANCH || branch?.commit?.sha !== commit) add('source', 'REMOTE_SOURCE', 'The fixed repository dev tip does not match the candidate commit or is unavailable.');
  observations.source = { repositoryId: repository?.id, commit: branch?.commit?.sha, protected: branch?.protected };
  const trustedApp = positiveId(app?.id) && app.slug === 'github-actions' && app.owner?.login === 'github';
  if (!trustedApp) add('ci', 'CI_APP_IDENTITY', 'The official github-actions app identity is unavailable or mismatched.');

  observations.protection = { protected: branch?.protected, strict: protection?.required_status_checks?.strict,
    enforceAdmins: protection?.enforce_admins?.enabled, reviews: protection?.required_pull_request_reviews };
  const reviewsPolicy = protection?.required_pull_request_reviews;
  const checks = protection?.required_status_checks?.checks;
  const bypass = reviewsPolicy?.bypass_pull_request_allowances;
  const noBypass = !bypass || ['users', 'teams', 'apps'].every((key) => Array.isArray(bypass[key]) && bypass[key].length === 0);
  if (!protection || branch?.protected !== true || protection.required_status_checks?.strict !== true || !Array.isArray(checks) || checks.length !== JOBS.length
    || !JOBS.every((name) => checks.filter((check) => check.context === name && trustedApp && check.app_id === app.id).length === 1)
    || protection.enforce_admins?.enabled !== true || !positiveId(reviewsPolicy?.required_approving_review_count)
    || reviewsPolicy.dismiss_stale_reviews !== true || reviewsPolicy.require_last_push_approval !== true
    || reviewsPolicy.require_code_owner_reviews !== true || !noBypass
    || protection.allow_force_pushes?.enabled !== false || protection.allow_deletions?.enabled !== false) {
    add('protection', 'BRANCH_PROTECTION', 'Current dev protection must enforce strict app-bound checks, independent required reviews, stale dismissal, latest-push/codeowner approval and no bypass/force/delete.');
  }
  if (rules) {
    observations.rules = rules.map(({ type, ruleset_source_type, ruleset_source, ruleset_id }) => ({ type, ruleset_source_type, ruleset_source, ruleset_id }));
    if (rules.length) add('protection', 'RULESET_POLICY_UNVERIFIED', 'Active inherited rule parameters are not supported by the current classic-protection contract; no CI/review effect is inferred from active/no-bypass alone.');
    for (const id of new Set(rules.map((rule) => rule.ruleset_id))) {
      if (!positiveId(id)) { add('protection', 'RULESET_UNVERIFIED', 'An active inherited rule has no valid ruleset identity.'); continue; }
      const detail = await request(`${ROOT}/rulesets/${id}?includes_parents=true`, 'protection');
      if (!detail || detail.id !== id || detail.enforcement !== 'active' || !Array.isArray(detail.bypass_actors) || detail.bypass_actors.length) {
        add('protection', 'RULESET_UNVERIFIED', `Active ruleset ${id}: bypass configuration or enforcement is unavailable or not strict.`);
      }
    }
  }
  finish('protection');

  async function inspectCi() {
    if (!positiveId(workflow?.id) || workflow.path !== WORKFLOW || workflow.state !== 'active') add('ci', 'WORKFLOW_IDENTITY', 'The approved workflow must exist and be active at its fixed path.');
    const matching = (runs ?? []).filter((run) => run.workflow_id === workflow?.id);
    if (matching.length !== 1 || !positiveId(matching[0]?.id)) {
      add('ci', 'WORKFLOW_RUN_MISSING', 'Exactly one unambiguous run of the approved workflow is required for the candidate SHA.'); finish('ci'); return;
    }
    const run = await request(`${ROOT}/actions/runs/${matching[0].id}`, 'ci');
    const validPath = [WORKFLOW, `${WORKFLOW}@${BRANCH}`, `${WORKFLOW}@refs/heads/${BRANCH}`].includes(run?.path);
    if (!run || run.id !== matching[0].id || run.repository?.id !== repository?.id || run.head_repository?.id !== repository?.id
      || run.head_sha !== commit || run.head_branch !== BRANCH || run.event !== 'push' || run.workflow_id !== workflow?.id || !validPath
      || !positiveId(run.run_attempt) || !positiveId(run.check_suite_id) || !success(run)) {
      add('ci', 'WORKFLOW_RUN_BINDING', 'Workflow run source, exact SHA, event, workflow, attempt or completed/success result is mismatched.'); finish('ci'); return;
    }
    const jobs = await list(`${ROOT}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'ci', 'jobs');
    observations.ci = { status: 'NOT_TESTED', runId: run.id, attempt: run.run_attempt, workflowId: workflow.id, appId: app?.id, jobs: [] };
    if (!jobs) { finish('ci'); return; }
    if (jobs.length !== JOBS.length || new Set(jobs.map((job) => job.id)).size !== jobs.length
      || !JOBS.every((name) => jobs.filter((job) => job.name === name).length === 1)) add('ci', 'JOB_SET', 'The six matrix jobs and final summary must each occur exactly once.');
    for (const job of jobs) {
      observations.ci.jobs.push({ id: job.id, name: job.name, status: job.status, conclusion: job.conclusion });
      if (!positiveId(job.id) || job.run_id !== run.id || job.head_sha !== commit || job.head_branch !== BRANCH
        || (job.run_attempt !== undefined && job.run_attempt !== run.run_attempt) || !success(job)) add('ci', 'JOB_RESULT', `${job.name}: not the fixed run/attempt or not completed/success.`);
      const requiredSteps = job.name === 'Quality summary' ? ['Require all matrix results'] : ['Install locked dependencies', 'Offline quality gates'];
      if (!Array.isArray(job.steps) || !requiredSteps.every((name) => job.steps.filter((item) => item.name === name && success(item)).length === 1)) add('ci', 'JOB_STEP_RESULT', `${job.name}: required install/quality/summary step is missing or non-success.`);
      let checkUrl;
      try { checkUrl = new URL(job.check_run_url); } catch { /* Rejected below without following untrusted links. */ }
      const checkId = checkUrl?.pathname.match(new RegExp(`^${ROOT}/check-runs/([1-9][0-9]*)$`, 'u'))?.[1];
      if (!checkUrl || checkUrl.origin !== API || checkUrl.username || checkUrl.password || checkUrl.search || checkUrl.hash || !checkId) {
        add('ci', 'CHECK_URL', `${job.name}: check URL is outside the fixed repository or malformed.`); continue;
      }
      const check = await request(checkUrl.pathname, 'ci');
      if (!check || check.id !== Number(checkId) || check.head_sha !== commit || check.check_suite?.id !== run.check_suite_id
        || !trustedApp || check.app?.id !== app.id || check.app?.slug !== 'github-actions' || check.name !== job.name || !success(check)) {
        add('ci', 'CHECK_BINDING', `${job.name}: check source, suite, SHA, name or strict success result differs.`);
      }
    }
    const current = await request(`${ROOT}/actions/runs/${run.id}`, 'ci');
    if (!current || current.run_attempt !== run.run_attempt || current.head_sha !== commit || !success(current)) add('ci', 'WORKFLOW_RUN_CHANGED', 'The workflow changed or restarted during verification.');
    finish('ci');
  }

  async function inspectCodeowners() {
    let file;
    for (const filePath of ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']) {
      file = await request(`${ROOT}/contents/${filePath}?ref=${commit}`, 'codeowners', { optional404: true });
      if (file) {
        if (file.path !== filePath || file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
          add('codeowners', 'CODEOWNERS_INVALID', 'The effective CODEOWNERS response is not a fixed-source ordinary file.');
        }
        break;
      }
    }
    const errors = await request(`${ROOT}/codeowners/errors?ref=${commit}`, 'codeowners');
    if (!file) add('codeowners', 'CODEOWNERS_UNAVAILABLE', 'No visible CODEOWNERS file exists at the fixed commit in the supported GitHub locations.');
    if (!errors || !Array.isArray(errors.errors) || errors.errors.length) add('codeowners', 'CODEOWNERS_INVALID', 'GitHub CODEOWNERS validation is unavailable or reports errors.');
    const bytes = typeof file?.content === 'string' ? Buffer.from(file.content, 'base64') : Buffer.alloc(0);
    if (bytes.length === 0 || bytes.length >= 3 * 1024 * 1024
      || !bytes.toString('utf8').split(/\r?\n/u).some((line) => line.trim() && !line.trim().startsWith('#'))) {
      add('codeowners', 'CODEOWNERS_INVALID', 'CODEOWNERS has no active entries or exceeds GitHub file limits.');
    }
    // An explicit supported coverage contract, not a partial GitHub glob interpreter. Later
    // overrides can clear owners; accepting arbitrary nonempty entries proves no gate coverage.
    const entries = bytes.toString('utf8').split(/\r?\n/u).map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    const fields = entries.length === 1 ? entries[0].split(/\s+/u) : [];
    if (fields[0] !== '*' || fields.length < 2 || fields.slice(1).some((field) => field.startsWith('#'))) {
      add('codeowners', 'CODEOWNERS_COVERAGE_UNVERIFIED', 'Current coverage supports one universal * owner... entry only; partial paths or overrides require a separately verified contract.');
    }
    observations.codeowners = { status: 'NOT_TESTED', path: file?.path, commit, sha256: createHash('sha256').update(bytes).digest('hex') };
    // Do not invent a local wildcard/team/RBAC engine. GitHub's current PR decision is checked separately.
    finish('codeowners');
  }

  async function inspectReview() {
    const related = await list(`${ROOT}/commits/${commit}/pulls`, 'review');
    const matches = (related ?? []).filter((pr) => pr.merge_commit_sha === commit && pr.base?.ref === BRANCH);
    if (matches.length !== 1 || !positiveId(matches[0]?.number)) {
      add('review', 'PULL_REQUEST_BINDING', 'Exactly one merged associated PR into dev must identify the candidate merge commit.'); finish('review'); return;
    }
    const pr = await request(`${ROOT}/pulls/${matches[0].number}`, 'review');
    if (!pr || pr.number !== matches[0].number || pr.merged !== true || pr.state !== 'closed' || pr.merge_commit_sha !== commit || !sha(pr.head?.sha)
      || pr.base?.ref !== BRANCH || pr.base.repo?.id !== repository?.id || pr.head?.repo?.id !== repository?.id || !positiveId(pr.user?.id)
      || !Number.isFinite(Date.parse(pr.merged_at))) {
      add('review', 'PULL_REQUEST_BINDING', 'The associated PR source/base repository, merged state, merge SHA or final head does not match.'); finish('review'); return;
    }
    const reviews = await list(`${ROOT}/pulls/${pr.number}/reviews`, 'review');
    const latest = new Map();
    for (const review of reviews ?? []) {
      if (!positiveId(review.id) || !positiveId(review.user?.id) || !['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED', 'COMMENTED', 'PENDING'].includes(review.state)) {
        add('review', 'PULL_REQUEST_APPROVALS', 'A review has malformed identity or state.'); continue;
      }
      if (['COMMENTED', 'PENDING'].includes(review.state)) continue;
      const timestamp = Date.parse(review.submitted_at);
      if (!Number.isFinite(timestamp) || timestamp > Date.parse(pr.merged_at)) { add('review', 'PULL_REQUEST_APPROVALS', 'Review timing is invalid or after the merge.'); continue; }
      const previous = latest.get(review.user.id);
      if (previous && Date.parse(previous.submitted_at) === timestamp) add('review', 'PULL_REQUEST_APPROVALS', 'Two opinionated reviews from the same user have ambiguous ordering.');
      if (!previous || Date.parse(previous.submitted_at) <= timestamp) latest.set(review.user.id, review);
    }
    const approved = [...latest.values()].filter((review) => review.state === 'APPROVED' && review.commit_id === pr.head.sha && review.user.id !== pr.user.id && review.user.type === 'User');
    if (!reviews || new Set(reviews.map((review) => review.id)).size !== reviews.length || approved.length < (reviewsPolicy?.required_approving_review_count ?? 1)
      || [...latest.values()].some((review) => review.state === 'CHANGES_REQUESTED')) add('review', 'PULL_REQUEST_APPROVALS', 'Fresh final-head approvals do not meet current required review count or a later opinion rejects them.');
    const platform = await request('/graphql', 'review', { query: {
      query: 'query($number:Int!){repository(owner:"freelogfe",name:"freelog-runtime-cli"){databaseId pullRequest(number:$number){number headRefOid baseRefName merged mergeCommit{oid} reviewDecision}}}',
      variables: { number: pr.number },
    } });
    const decision = platform?.data?.repository?.pullRequest;
    if (!platform || platform.errors?.length || platform.data?.repository?.databaseId !== repository?.id || decision?.number !== pr.number || decision.headRefOid !== pr.head.sha
      || decision.baseRefName !== BRANCH || decision.merged !== true || decision.mergeCommit?.oid !== commit || decision.reviewDecision !== 'APPROVED') {
      add('review', 'REVIEW_DECISION_UNVERIFIED', 'GitHub current computed approval is unavailable, null, non-approved or bound to a different PR/head/merge.');
    }
    observations.review = { status: 'NOT_TESTED', number: pr.number, head: pr.head.sha, mergeCommit: commit,
      currentDecision: decision?.reviewDecision, approverIds: approved.map((review) => review.user.id).sort((a, b) => a - b),
      reviews: (reviews ?? []).map(({ id, user, state, commit_id, submitted_at }) => ({ id, userId: user?.id, state, commit: commit_id, submittedAt: submitted_at })) };
    finish('review');
  }

  await Promise.all([inspectCi(), inspectCodeowners(), inspectReview()]);
  const currentBranch = await request(`${ROOT}/branches/${BRANCH}`, 'source');
  if (currentBranch?.commit?.sha !== commit) add('source', 'REMOTE_SOURCE_CHANGED', 'The dev tip changed during verification.');
  return result();
}
