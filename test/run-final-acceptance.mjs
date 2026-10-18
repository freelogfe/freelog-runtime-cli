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
import { acceptanceCatalog, acceptanceScripts, initialCases, legacyScripts, manifestSha256 } from './acceptance/catalog.mjs';
import { consoleProducer, processResult, validateCandidateReport, validateCompletedConsoleSuite, validateSuiteCases } from './acceptance/protocol.mjs';
import { redactEvidence as redact } from './acceptance/evidence-redaction.mjs';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const lines = [];
const log = (value) => { const safe = redact(value); console.log(safe); lines.push(safe); };
class BlockedSetupError extends Error {}

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
  const options = { env: 'dev', skipBuild: false, plan: false };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === '--skip-build') options.skipBuild = true;
    else if (flag === '--plan') options.plan = true;
    else if (flag === '--help') options.help = true;
    else if (flag === '--candidate' || flag === '--env') {
      if (!values[index + 1] || values[index + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
      options[flag === '--candidate' ? 'candidate' : 'env'] = values[++index];
    } else throw new Error(`Unknown acceptance argument: ${flag}`);
  }
  if (options.candidate && options.skipBuild) throw new Error('--candidate already forbids workspace builds; do not combine with --skip-build.');
  if (options.env !== 'dev') throw new Error('Real acceptance permits --env dev only.');
  return options;
}

async function main() {
  const options = argumentsOf(args);
  if (options.help) {
    console.log('Usage: node test/run-final-acceptance.mjs [--candidate <candidate.json|directory>] [--env dev] [--plan]\n'
      + 'Without --candidate: development evidence only; optional --skip-build.\n'
      + 'With --candidate: installed bin only, no build/fallback; acceptance.json is bound to the fixed package.\n'
      + 'Required NOT_TESTED/BLOCKED cases prevent release even when all legacy scripts exit 0.');
    return 0;
  }
  const verified = options.candidate ? readCandidate(options.candidate, { repoRoot }) : undefined;
  const candidate = verified?.candidate;
  if (!candidate && (Object.hasOwn(process.env, 'FREELOG_TEST_CLI_BIN') || process.env.FREELOG_TEST_CANDIDATE_MODE === '1')) {
    throw new Error('The aggregate runner requires --candidate for an installed-bin override; inherited overrides are not development evidence.');
  }
  if (options.plan) {
    console.log(JSON.stringify({ releaseEvidence: candidate?.purpose === 'release', purpose: candidate?.purpose ?? 'development',
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
  const stopLegacy = (reason, status) => {
    for (const script of legacyScripts) setCase({ id: `LEGACY.${script.replace(/\.mjs$/u, '')}`, status, assertions: [], reason,
      process: { exitCode: null, signal: null, error: null, timedOut: false } });
  };
  let setupError;
  try {
    const requiredFiles = ['.freelog-test-credentials.local.json', '.freelog-test-resource-pool.local.json', '.freelog-test-optional-config.local.json'];
    if (requiredFiles.some((name) => !existsSync(path.join(testRoot, name)))) {
      throw new BlockedSetupError('Required private dev credentials, resource pool or optional-config fixture is unavailable.');
    }
    if (!candidate && !options.skipBuild) {
      const build = processResult(spawnSync('pnpm', ['--fail-if-no-match', '--filter', '@freelog-cli/cli2', 'build'], {
        cwd: repoRoot, env: childEnv, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000,
      }));
      if (build.status !== 'PASS') throw new Error('Workspace CLI build did not complete successfully.');
    }
    // Native PTY worker cleanup cannot leave this orchestrator alive indefinitely.
    const probe = spawnSync(process.execPath, [path.join(testRoot, 'acceptance', 'tty-probe.mjs'), repoRoot], {
      cwd: repoRoot, env: childEnv, encoding: 'utf8', timeout: 60_000,
    });
    writeFileSync(path.join(evidenceDir, 'tty-probe.txt'), redact(`${probe.stdout ?? ''}\n${probe.stderr ?? ''}`), 'utf8');
    const probed = processResult(probe);
    if (probed.status === 'BLOCKED') throw new BlockedSetupError('TTY capability is explicitly unavailable; inspect its dedicated evidence.');
    if (probed.status !== 'PASS') throw new Error('TTY capability probe failed or timed out; inspect its dedicated evidence.');
  } catch (error) {
    setupError = redact(error instanceof Error ? error.message : String(error));
    const status = error instanceof BlockedSetupError ? 'BLOCKED' : 'FAIL';
    stopLegacy(setupError, status);
    log(`${status} setup: ${setupError}`);
  }
  if (!setupError) {
    for (const script of acceptanceScripts()) {
      const suiteReport = path.join(evidenceDir, `${script}.json`);
      const child = spawnSync(process.execPath, [path.join(testRoot, script), '--env', 'dev', '--skip-build'], {
        cwd: repoRoot, env: { ...childEnv, FREELOG_TEST_SUITE_REPORT: suiteReport, FREELOG_TEST_RUN_ID: runId },
        encoding: 'utf8', timeout: 1_800_000, maxBuffer: 16 * 1024 * 1024,
      });
      const collected = collectSuiteOutcome(script, child, suiteReport, acceptanceCatalog, runId);
      const { outcome } = collected;
      writeFileSync(path.join(evidenceDir, `${script}.txt`), redact(`${JSON.stringify(outcome.process)}\n${child.stdout ?? ''}\n${child.stderr ?? ''}`), 'utf8');
      for (const result of collected.cases) setCase(result);
      if (collected.legacyCase) setCase(collected.legacyCase);
      log(`${outcome.status}: ${script} (${collected.legacyCase ? 'legacy process evidence only' : 'business producer; inspect individual cases'})`);
    }
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
  const reportPath = path.join(reportDir, 'acceptance.json');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  for (const item of report.cases.filter((item) => item.status !== 'PASS')) log(`${item.status}: ${item.id} — ${item.reason}`);
  log(`Case summary: ${JSON.stringify(counts)}; releaseApproved=${report.releaseApproved}`);
  log(`Structured evidence: ${reportPath}`);
  writeFileSync(path.join(reportDir, 'summary.txt'), `${lines.join('\n')}\n`, 'utf8');
  if (counts.FAIL) return 1;
  return counts.BLOCKED || counts.NOT_TESTED || releaseError ? 3 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(await main()); } catch (error) {
    console.error(redact(`FAIL: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}
