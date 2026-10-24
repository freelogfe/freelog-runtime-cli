#!/usr/bin/env node
/** Real dev orchestration: legacy exits and business evidence remain separate, with explicit coverage gaps. */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCandidate } from '../scripts/release/core.mjs';
import { readSourceState } from '../scripts/release/source-revision.mjs';
import { acceptanceCatalog, acceptanceScripts, initialCases, manifestSha256 } from './acceptance/catalog.mjs';
import { consoleProducer, processResult, validateCandidateReport, validateCompletedConsoleSuite, validateSuiteCases } from './acceptance/protocol.mjs';
import { redactEvidence as redact } from './acceptance/evidence-redaction.mjs';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const lines = [];
const log = (value) => { const safe = redact(value); console.log(safe); lines.push(safe); };
class BlockedSetupError extends Error {}

/** Source-fixed diagnostic scopes never alter the full acceptance catalog or accept arbitrary scripts. */
export function acceptanceScope(scope = 'full') {
  const all = acceptanceScripts();
  if (scope === 'full') return { scope, scripts: all, needsTty: true };
  if (scope === 'type-init') {
    const scripts = ['verify-type-init.mjs'];
    if (!all.includes(scripts[0])) throw new Error('The type/init scope lost its fixed producer.');
    return { scope, scripts, needsTty: false }; // Producer owns its isolated terminal capability probe.
  }
  if (scope === 'collection-publish-preview') {
    const scripts = ['verify-collection-publish-preview.mjs'];
    if (!all.includes(scripts[0])) throw new Error('The preview scope lost its fixed producer.');
    return { scope, scripts, needsTty: false }; // Producer owns the isolated native probe.
  }
  if (scope === 'collection-publish-preflight') {
    const scripts = ['verify-collection-publish-preflight.mjs'];
    if (!all.includes(scripts[0])) throw new Error('The publication preflight scope lost its fixed producer.');
    return { scope, scripts, needsTty: false };
  }
  if (scope === 'collection-rules') {
    const scripts = ['verify-collection-rules.mjs'];
    if (!all.includes(scripts[0])) throw new Error('The rules scope lost its fixed producer.');
    return { scope, scripts, needsTty: false };
  }
  if (scope === 'collection-edit') {
    const scripts = ['verify-collection-edit.mjs', 'verify-collection-selection.mjs'];
    if (scripts.some((script) => !all.includes(script))) throw new Error('The edit integration scope lost a fixed producer.');
    return { scope, scripts, needsTty: false }; // Selection owns its isolated native probe.
  }
  if (scope === 'collection-selection') {
    const scripts = ['verify-collection-identity.mjs', 'verify-collection-selection.mjs'];
    if (scripts.some((script) => !all.includes(script))) throw new Error('The selection scope lost an installed producer.');
    // This producer performs its own native probe using its isolated env, not the host-env generic probe.
    return { scope, scripts, needsTty: false };
  }
  if (scope === 'collection-items') {
    const scripts = ['verify-collection-items.mjs'];
    if (!all.includes(scripts[0])) throw new Error('The items scope lost its fixed installed producer.');
    return { scope, scripts, needsTty: false };
  }
  if (scope === 'collection-recovery') {
    const scripts = ['verify-collection-recovery.mjs'];
    if (!all.includes(scripts[0])) throw new Error('The recovery scope lost its fixed installed producer.');
    return { scope, scripts, needsTty: false };
  }
  if (scope !== 'collection-lifecycle') throw new Error(`Unknown acceptance scope: ${scope}`);
  const scripts = ['verify-theme-image-full-lifecycle.mjs', 'verify-collection-lifecycle.mjs'];
  if (scripts.some((script) => !all.includes(script))) throw new Error('The collection scope lost a fixed prerequisite producer.');
  return { scope, scripts, needsTty: false };
}

/** One process may own several business cases; a successful exit never supplies their missing evidence. */
export function collectSuiteOutcome(script, child, reportFile, catalog = acceptanceCatalog, runId) {
  // The CLI always uses the source-fixed catalog; a report cannot choose its own obligations.
  if (!acceptanceScripts(catalog).includes(script)) throw new Error(`Unknown acceptance producer: ${script}`);
  const outcome = processResult(child);
  if (outcome.process.error !== null) outcome.process.error = redact(outcome.process.error);
  const expected = catalog.filter((item) => item.kind === 'product-case' && item.script === script);
  let cases = [];
  let completedConsole;
  try {
    if (existsSync(reportFile)) {
      const stat = lstatSync(reportFile);
      if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(reportFile) !== reportFile || stat.size > 5_000_000) {
        throw new Error('Structured producer report is not a safe regular file.');
      }
      const bytes = readFileSync(reportFile);
      const original = JSON.parse(bytes.toString('utf8'));
      cases = validateSuiteCases(original, script, catalog);
      if (script === consoleProducer) {
        cases = validateCompletedConsoleSuite(original, runId, outcome.process, catalog);
        completedConsole = { producer: script, runId, process: outcome.process,
          evidenceRef: { path: reportFile, sha256: createHash('sha256').update(bytes).digest('hex'), runId } };
      }
    } else if (expected.length && outcome.status === 'PASS') {
      throw new Error(`Missing structured business report from ${script}`);
    } else if (script === consoleProducer) {
      throw new Error(`Missing final Console business report from ${script}`);
    }
  } catch (error) {
    outcome.status = 'FAIL';
    outcome.reason = redact(`Malformed child case evidence: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (completedConsole) {
    cases = cases.map((item) => ({ ...item, ...(item.reason ? { reason: redact(item.reason) } : {}), producerProcess: completedConsole }));
  } else if (outcome.status !== 'PASS') {
    cases = expected.map((descriptor) => {
      const observed = cases.find((item) => item.id === descriptor.id);
      // Preserve a genuine business failure; never retain PASS after a producer crash or missing report.
      return { ...(observed ?? { id: descriptor.id, assertions: [] }),
        status: observed?.status === 'FAIL' ? 'FAIL' : outcome.status, process: outcome.process,
        reason: outcome.reason };
    });
  } else cases = cases.map((item) => ({ ...item, ...(item.reason ? { reason: redact(item.reason) } : {}), process: outcome.process }));
  const legacy = catalog.find((item) => item.kind === 'legacy-suite' && item.script === script);
  return { outcome, cases, ...(legacy ? { legacyCase: { id: legacy.id, ...outcome } } : {}) };
}

function argumentsOf(values) {
  const options = { env: 'dev', skipBuild: false, plan: false, scope: 'full' }; let scopeProvided = false;
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === '--skip-build') options.skipBuild = true;
    else if (flag === '--plan') options.plan = true;
    else if (flag === '--help') options.help = true;
    else if (flag === '--candidate' || flag === '--env' || flag === '--scope') {
      if (!values[index + 1] || values[index + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
      if (flag === '--scope') { if (scopeProvided) throw new Error('Duplicate --scope is not permitted.'); scopeProvided = true; }
      options[flag.slice(2)] = values[++index];
    } else throw new Error(`Unknown acceptance argument: ${flag}`);
  }
  if (options.candidate && options.skipBuild) throw new Error('--candidate already forbids workspace builds; do not combine with --skip-build.');
  if (options.env !== 'dev') throw new Error('Real acceptance permits --env dev only.');
  acceptanceScope(options.scope);
  if (options.scope !== 'full' && !options.plan && !options.help && !options.candidate) throw new Error('Scoped execution requires a development --candidate; workspace fallback is forbidden.');
  return options;
}

/** Execute a fixed scope with one run/bin binding; unselected obligations are not supplied by process exits. */
export function runAcceptanceProducers(scope, { evidenceDir, childEnv, runId, setCase, log: reportLog }, spawn = spawnSync) {
  for (const script of acceptanceScope(scope).scripts) {
    const suiteReport = path.join(evidenceDir, `${script}.json`);
    const child = spawn(process.execPath, [path.join(testRoot, script), '--env', 'dev', '--skip-build'], {
      cwd: repoRoot, env: { ...childEnv, FREELOG_TEST_SUITE_REPORT: suiteReport, FREELOG_TEST_RUN_ID: runId },
      encoding: 'utf8', timeout: 1_800_000, maxBuffer: 16 * 1024 * 1024,
    });
    const collected = collectSuiteOutcome(script, child, suiteReport, acceptanceCatalog, runId), { outcome } = collected;
    writeFileSync(path.join(evidenceDir, `${script}.txt`), redact(`${JSON.stringify(outcome.process)}\n${child.stdout ?? ''}\n${child.stderr ?? ''}`), 'utf8');
    for (const result of collected.cases) setCase(result);
    if (collected.legacyCase) setCase(collected.legacyCase);
    reportLog(`${outcome.status}: ${script} (${collected.legacyCase ? 'legacy process evidence only' : 'business producer; inspect individual cases'})`);
  }
}

async function main() {
  const options = argumentsOf(args), selection = acceptanceScope(options.scope);
  if (options.help) {
    console.log('Usage: node test/run-final-acceptance.mjs [--candidate <candidate.json|directory>] [--env dev] [--plan] [--scope full|type-init|collection-lifecycle|collection-recovery|collection-items|collection-selection|collection-edit|collection-rules|collection-publish-preflight|collection-publish-preview]\n'
      + 'Without --candidate: development evidence only; optional --skip-build.\n'
      + 'With --candidate: installed bin only, no build/fallback; acceptance.json is bound to the fixed package.\n'
      + 'collection-lifecycle: development candidate required; fixed prerequisites only, separate diagnostic report, never full release acceptance.\n'
      + 'collection-recovery: development candidate required; fixed installed local fault matrix only, no real-dev credentials or TTY; never full release acceptance.\n'
      + 'Required NOT_TESTED/BLOCKED cases prevent release even when all legacy scripts exit 0.');
    return 0;
  }
  const verified = options.candidate ? readCandidate(options.candidate, { repoRoot }) : undefined;
  const candidate = verified?.candidate;
  if (options.scope !== 'full' && candidate && candidate.purpose !== 'development') throw new Error('Scoped diagnosis permits development candidates only.');
  if (!candidate && (Object.hasOwn(process.env, 'FREELOG_TEST_CLI_BIN') || process.env.FREELOG_TEST_CANDIDATE_MODE === '1')) {
    throw new Error('The aggregate runner requires --candidate for an installed-bin override; inherited overrides are not development evidence.');
  }
  if (options.plan) {
    console.log(JSON.stringify({ releaseEvidence: candidate?.purpose === 'release', purpose: candidate?.purpose ?? 'development',
      scope: selection.scope, scripts: selection.scripts,
      sourceRevision: candidate?.sourceRevision ?? null, manifestSha256: manifestSha256(),
      cliBin: candidate?.cliBin ?? 'workspace dist (development only)', cases: acceptanceCatalog }, null, 2));
    return 0;
  }
  const startedAt = new Date().toISOString();
  const reportDir = candidate ? path.dirname(verified.candidateFile)
    : path.join(tmpdir(), 'freelog-runtime-cli-verification', 'acceptance-runs', startedAt.replace(/[:.]/gu, '-'));
  const runId = randomUUID();
  const evidenceDir = path.join(reportDir, 'evidence', runId);
  mkdirSync(evidenceDir, { recursive: true });
  log(`Run evidence directory: ${evidenceDir}`);
  const source = candidate ?? readSourceState(repoRoot);
  const report = {
    schemaVersion: 2, environment: 'dev', releaseEvidence: candidate?.purpose === 'release', runId, evidenceDir,
    scope: selection.scope,
    purpose: candidate?.purpose ?? 'development', sourceRevision: source.sourceRevision,
    sourceFingerprint: source.sourceFingerprint,
    tarballSha512: candidate?.tarballSha512 ?? null,
    cliBin: candidate?.cliBin ?? path.join(repoRoot, 'packages/cli/dist/bin/index.js'),
    platform: process.platform, nodeVersion: process.version,
    startedAt, finishedAt: null, manifestSha256: manifestSha256(), cases: initialCases(),
  };
  const childEnv = { ...process.env,
    ...(candidate ? { FREELOG_TEST_CLI_BIN: candidate.cliBin, FREELOG_TEST_CANDIDATE_MODE: '1' } : {}),
  };
  const setCase = (result) => {
    const index = report.cases.findIndex((item) => item.id === result.id);
    if (index < 0) throw new Error(`Unknown case: ${result.id}`);
    report.cases[index] = { ...result, ...(result.reason ? { reason: redact(result.reason) } : {}) };
  };
  const stopSelected = (reason, status) => {
    for (const item of acceptanceCatalog.filter((item) => selection.scripts.includes(item.script))) setCase({ id: item.id, status, assertions: [], reason,
      process: { exitCode: null, signal: null, error: null, timedOut: false } });
  };
  let setupError;
  try {
    const requiredFiles = ['.freelog-test-credentials.local.json', '.freelog-test-resource-pool.local.json', '.freelog-test-optional-config.local.json'];
    if (!['type-init', 'collection-recovery', 'collection-items', 'collection-selection', 'collection-edit', 'collection-rules', 'collection-publish-preflight', 'collection-publish-preview'].includes(selection.scope) && requiredFiles.some((name) => !existsSync(path.join(testRoot, name)))) {
      throw new BlockedSetupError('Required private dev credentials, resource pool or optional-config fixture is unavailable.');
    }
    if (!candidate && !options.skipBuild) {
      const build = processResult(spawnSync('pnpm', ['--fail-if-no-match', '--filter', '@freelog-cli/cli2', 'build'], {
        cwd: repoRoot, env: childEnv, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000,
      }));
      if (build.status !== 'PASS') throw new Error('Workspace CLI build did not complete successfully.');
    }
    if (selection.needsTty) {
      // Native PTY worker cleanup cannot leave this orchestrator alive indefinitely.
      const probe = spawnSync(process.execPath, [path.join(testRoot, 'acceptance', 'tty-probe.mjs'), repoRoot], {
        cwd: repoRoot, env: childEnv, encoding: 'utf8', timeout: 60_000,
      });
      writeFileSync(path.join(evidenceDir, 'tty-probe.txt'), redact(`${probe.stdout ?? ''}\n${probe.stderr ?? ''}`), 'utf8');
      const probed = processResult(probe);
      if (probed.status === 'BLOCKED') throw new BlockedSetupError('TTY capability is explicitly unavailable; inspect its dedicated evidence.');
      if (probed.status !== 'PASS') throw new Error('TTY capability probe failed or timed out; inspect its dedicated evidence.');
    }
  } catch (error) {
    setupError = redact(error instanceof Error ? error.message : String(error));
    const status = error instanceof BlockedSetupError ? 'BLOCKED' : 'FAIL';
    stopSelected(setupError, status);
    log(`${status} setup: ${setupError}`);
  }
  if (!setupError) {
    runAcceptanceProducers(selection.scope, { evidenceDir, childEnv, runId, setCase, log });
  }
  report.finishedAt = new Date().toISOString();
  let releaseError;
  if (candidate) {
    try {
      readCandidate(verified.candidateFile, { repoRoot });
      validateCandidateReport(report, { ...candidate, candidateDir: reportDir });
    } catch (error) { releaseError = redact(error instanceof Error ? error.message : String(error)); }
  }
  const counts = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED', 'NOT_TESTED'].map((status) => [status, report.cases.filter((item) => item.status === status).length]));
  report.summary = counts;
  report.releaseApproved = candidate?.purpose === 'release' && !releaseError;
  if (releaseError) report.releaseBlocker = releaseError;
  const suffix = selection.scope === 'full' ? '' : `.${selection.scope}.${runId}`;
  const reportPath = path.join(reportDir, `acceptance${suffix}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  for (const item of report.cases.filter((item) => item.status !== 'PASS')) log(`${item.status}: ${item.id} — ${item.reason}`);
  log(`Case summary: ${JSON.stringify(counts)}; releaseApproved=${report.releaseApproved}`);
  log(`Structured evidence: ${reportPath}`);
  writeFileSync(path.join(reportDir, `summary${suffix}.txt`), `${lines.join('\n')}\n`, 'utf8');
  if (counts.FAIL) return 1;
  return counts.BLOCKED || counts.NOT_TESTED || releaseError ? 3 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Piped stdout is asynchronous on POSIX; forcing exit can truncate --plan JSON or summaries.
  try { process.exitCode = await main(); } catch (error) {
    console.error(redact(`FAIL: ${error instanceof Error ? error.message : String(error)}`));
    process.exitCode = 1;
  }
}
