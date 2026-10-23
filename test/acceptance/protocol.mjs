/** Fail-closed candidate acceptance protocol. Stdout is evidence, never the result parser. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { acceptanceCatalog, manifestSha256, validateCatalog } from './catalog.mjs';
import { sameSourceRevision, validSourceRevision } from '../../scripts/release/source-revision.mjs';
import { commandParameterCases } from './command-parameter-cases.mjs';
import { evaluateCommandCase } from './command-parameter-evidence.mjs';
import { evaluateVersionLifecycle, versionLifecycleCases } from './version-lifecycle-evidence.mjs';
import { evaluateResourceSyncCase, resourceSyncCases } from './resource-sync-evidence.mjs';
import { evaluateResourceManagementCase, resourceManagementCases, validateManagementFiles } from './resource-management-evidence.mjs';
import { consoleRoundtripCases, evaluateConsoleRoundtripCase, validateConsoleRoundtripFiles } from './console-roundtrip-evidence.mjs';
import { collectionLifecycleCases, evaluateCollectionLifecycleCase, validateCollectionLifecycleFiles } from './collection-lifecycle-evidence.mjs';
import { collectionRecoveryCases, evaluateCollectionRecovery, validateCollectionRecoveryFiles } from './collection-recovery-evidence.mjs';
import { collectionItemsCases, evaluateCollectionItems, validateCollectionItemsFiles } from './collection-items-evidence.mjs';
import { collectionSelectionCases, evaluateCollectionSelection, validateCollectionSelectionFiles } from './collection-selection-evidence.mjs';
import { collectionEditCases, evaluateCollectionEdits, validateCollectionEditFiles } from './collection-edit-evidence.mjs';
import { collectionIdentityCases, evaluateCollectionIdentity, validateCollectionIdentityFiles } from './collection-identity-evidence.mjs';
import { collectionRulesCases, evaluateCollectionRules, validateCollectionRulesFiles } from './collection-rules-evidence.mjs';
import { collectionPublishPreflightCases, evaluateCollectionPublishPreflight, validateCollectionPublishPreflightFiles } from './collection-publish-preflight-evidence.mjs';
import { collectionPublishPreviewCases, evaluateCollectionPublishPreview, validateCollectionPublishPreviewFiles } from './collection-publish-preview-evidence.mjs';

export const statuses = Object.freeze(['PASS', 'FAIL', 'BLOCKED', 'NOT_TESTED']);
export const maximumEvidenceAgeMs = 24 * 60 * 60 * 1000;
export const consoleProducer = 'verify-console-roundtrip.mjs';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;

/** A crash, signal or timeout is never an expected business rejection, even if stderr matches. */
export function matchesCommandResult(result, expectedError, stderr = result.stderr ?? '') {
  const completed = Number.isInteger(result.status) && !result.error && !result.signal && result.timedOut !== true;
  return completed && (expectedError === undefined ? result.status === 0
    : result.status !== 0 && String(stderr).includes(expectedError));
}

export function processResult(result) {
  const process = {
    exitCode: result.status ?? null, signal: result.signal ?? null,
    error: result.error ? String(result.error.message ?? result.error) : null,
    timedOut: result.timedOut === true || result.error?.code === 'ETIMEDOUT',
  };
  const completed = Number.isInteger(process.exitCode) && !process.signal && !process.error && !process.timedOut;
  const status = !completed ? 'FAIL' : process.exitCode === 0 ? 'PASS' : process.exitCode === 3 ? 'BLOCKED' : 'FAIL';
  return {
    status, process,
    assertions: [{ id: 'process-completed', passed: completed && process.exitCode === 0 }],
    ...(status === 'PASS' ? {} : { reason: completed
      ? `Harness explicitly exited ${process.exitCode}; inspect its retained evidence without guessing responsibility from stdout.`
      : 'Harness did not complete normally (spawn error, timeout, signal or missing exit status).' }),
  };
}

/** Child scripts may add genuine business case evidence; no result is inferred from log text. */
export function writeSuiteCases(cases, output = process.env.FREELOG_TEST_SUITE_REPORT, completion) {
  if (!output) return;
  const runId = process.env.FREELOG_TEST_RUN_ID;
  const recorded = cases.map((item) => {
    if (!runId) return item;
    const file = `${output}.${item.id.replace(/[^A-Za-z0-9_-]/gu, '_')}.evidence.json`;
    const bytes = `${JSON.stringify({ schemaVersion: 1, runId, caseId: item.id, assertions: item.assertions,
      ...(item.templateResults ? { templateResults: item.templateResults } : {}),
      ...(item.observations ? { observations: item.observations } : {}) }, null, 2)}\n`;
    writeFileSync(file, bytes, 'utf8');
    return { ...item, evidenceRef: { path: file, sha256: createHash('sha256').update(bytes).digest('hex'), runId } };
  });
  writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, cases: recorded,
    ...(completion === undefined ? {} : { completion }) }, null, 2)}\n`, 'utf8');
}

/** Only the Console producer has independent case outcomes after an explicitly completed business run. */
export function validateCompletedConsoleSuite(report, runId, child, catalog = acceptanceCatalog) {
  const cases = validateSuiteCases(report, consoleProducer, catalog);
  const exitCode = cases.some((item) => item.status === 'FAIL') ? 1 : cases.some((item) => item.status !== 'PASS') ? 3 : 0;
  const expectedCompletion = { schemaVersion: 1, producer: consoleProducer, runId, state: 'COMPLETED', exitCode };
  if (!/^[A-Za-z0-9-]{1,80}$/u.test(runId ?? '') || !isDeepStrictEqual(report.completion, expectedCompletion)
    || !isDeepStrictEqual(child, { exitCode, signal: null, error: null, timedOut: false })
    || cases.some((item) => Object.hasOwn(item, 'process') || Object.hasOwn(item, 'producerProcess'))) {
    throw new Error('Console producer lacks a matching normal completion envelope and derived process exit.');
  }
  return cases;
}

function validateConsoleProducerTrace(result, report) {
  const producer = result.producerProcess;
  const reference = producer?.evidenceRef;
  const failure = `CONSOLE_PRODUCER_EVIDENCE: ${result.id}`;
  try {
    const expectedFile = path.join(report.evidenceDir, `${consoleProducer}.json`);
    if (!object(producer) || producer.producer !== consoleProducer || producer.runId !== report.runId
      || reference?.runId !== report.runId || reference?.path !== expectedFile || !/^[a-f0-9]{64}$/u.test(reference?.sha256 ?? '')
      || !lstatSync(expectedFile).isFile() || lstatSync(expectedFile).isSymbolicLink()
      || realpathSync(expectedFile) !== expectedFile || lstatSync(expectedFile).size > 5_000_000) throw new Error(failure);
    const bytes = readFileSync(expectedFile);
    if (createHash('sha256').update(bytes).digest('hex') !== reference.sha256) throw new Error(failure);
    const original = JSON.parse(bytes.toString('utf8'));
    const cases = validateCompletedConsoleSuite(original, report.runId, producer.process);
    const { producerProcess: ignored, ...businessCase } = result;
    if (!isDeepStrictEqual(cases.find((item) => item.id === result.id), businessCase)) throw new Error(failure);
  } catch { throw new Error(failure); }
}

function validateCaseShape(result, descriptor) {
  if (!object(result) || !statuses.includes(result.status)) throw new Error(`Invalid case status: ${descriptor.id}`);
  if (!Array.isArray(result.assertions)) throw new Error(`Missing assertions: ${descriptor.id}`);
  const ids = new Set();
  for (const assertion of result.assertions) {
    if (!object(assertion) || !text(assertion.id) || !descriptor.assertionIds.includes(assertion.id)
      || typeof assertion.passed !== 'boolean' || ids.has(assertion.id)) {
      throw new Error(`Malformed/duplicate assertion: ${descriptor.id}`);
    }
    ids.add(assertion.id);
  }
  if (result.status === 'PASS') {
    if (descriptor.gap) throw new Error(`Unimplemented acceptance obligation cannot be marked PASS: ${descriptor.id}`);
    if (result.assertions.length === 0 || result.assertions.some((item) => item.passed !== true)
      || descriptor.assertionIds.some((id) => !ids.has(id))) {
      throw new Error(`PASS lacks successful required assertions: ${descriptor.id}`);
    }
    if (descriptor.kind === 'product-case' && result.assertions.some((item) => !Object.hasOwn(item, 'expected')
      || !Object.hasOwn(item, 'actual') || !isDeepStrictEqual(item.expected, item.actual))) {
      throw new Error(`Product PASS lacks exact expected/actual evidence: ${descriptor.id}`);
    }
  } else if (!text(result.reason)) {
    throw new Error(`Non-PASS case needs an explicit reason: ${descriptor.id}`);
  }
  const unexecuted = result.status === 'NOT_TESTED' && result.assertions.length === 0 && result.process === undefined;
  if (descriptor.kind === 'legacy-suite' && !unexecuted && !object(result.process)) {
    throw new Error(`Legacy suite lacks process evidence: ${descriptor.id}`);
  }
  if (result.process !== undefined) {
    const child = result.process;
    if (!object(child) || !Object.hasOwn(child, 'exitCode') || !Object.hasOwn(child, 'signal')
      || !Object.hasOwn(child, 'error') || typeof child.timedOut !== 'boolean'
      || (child.exitCode !== null && !Number.isInteger(child.exitCode))
      || (child.signal !== null && !text(child.signal)) || (child.error !== null && !text(child.error))) {
      throw new Error(`Malformed child process evidence: ${descriptor.id}`);
    }
    if (result.status === 'PASS' && (child.exitCode !== 0 || child.signal || child.error || child.timedOut)) {
      throw new Error(`PASS conceals a failed child process: ${descriptor.id}`);
    }
  }
}

function validateProductTrace(result, report) {
  const reference = result.evidenceRef;
  if (!object(reference) || reference.runId !== report.runId || !text(reference.path) || !path.isAbsolute(reference.path)
    || !/^[a-f0-9]{64}$/u.test(reference.sha256 ?? '')) throw new Error(`Missing run-bound product evidence: ${result.id}`);
  const relative = path.relative(report.evidenceDir, reference.path);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    || !existsSync(reference.path) || !lstatSync(reference.path).isFile() || lstatSync(reference.path).isSymbolicLink()
    || realpathSync(reference.path) !== reference.path || lstatSync(reference.path).size > 5_000_000) {
    throw new Error(`Unsafe/missing product evidence file: ${result.id}`);
  }
  const bytes = readFileSync(reference.path);
  if (createHash('sha256').update(bytes).digest('hex') !== reference.sha256) throw new Error(`Product evidence changed: ${result.id}`);
  const evidence = JSON.parse(bytes.toString('utf8'));
  if (!object(evidence) || evidence.schemaVersion !== 1 || evidence.runId !== report.runId || evidence.caseId !== result.id
    || !isDeepStrictEqual(evidence.assertions, result.assertions)) throw new Error(`Product evidence binding differs: ${result.id}`);
  const commandLeaf = commandParameterCases.find((item) => item.id === result.id);
  const versionLeaf = versionLifecycleCases.find((item) => item.id === result.id);
  const syncLeaf = resourceSyncCases.find((item) => item.id === result.id);
  const managementLeaf = resourceManagementCases.find((item) => item.id === result.id);
  const consoleLeaf = consoleRoundtripCases.find((item) => item.id === result.id);
  const collectionLeaf = collectionLifecycleCases.find((item) => item.id === result.id);
  const recoveryLeaf = collectionRecoveryCases.find((item) => item.id === result.id);
  const itemsLeaf = collectionItemsCases.find((item) => item.id === result.id);
  const selectionLeaf = collectionSelectionCases.find((item) => item.id === result.id);
  const editLeaf = collectionEditCases.find((item) => item.id === result.id);
  const identityLeaf = collectionIdentityCases.find((item) => item.id === result.id);
  const rulesLeaf = collectionRulesCases.find((item) => item.id === result.id);
  const preflightLeaf = collectionPublishPreflightCases.find((item) => item.id === result.id);
  const previewLeaf = collectionPublishPreviewCases.find((item) => item.id === result.id);
  if (commandLeaf || versionLeaf || syncLeaf || managementLeaf || consoleLeaf || collectionLeaf || recoveryLeaf || itemsLeaf || selectionLeaf || editLeaf || identityLeaf || rulesLeaf || preflightLeaf || previewLeaf) {
    const failure = `SOURCE_CASE_EVIDENCE: ${result.id}`;
    if (!object(evidence.observations) || !isDeepStrictEqual(evidence.observations, result.observations)
      || evidence.observations.cliBin !== report.cliBin) throw new Error(failure);
    let recomputed;
    try {
      if (consoleLeaf || managementLeaf || collectionLeaf || recoveryLeaf || itemsLeaf || selectionLeaf || editLeaf || identityLeaf || rulesLeaf || preflightLeaf || previewLeaf) {
        if (consoleLeaf) validateConsoleProducerTrace(result, report);
        const observed = evidence.observations;
        // Nested files must still exist in this run; embedded copies and a claimed bin hash are not sufficient.
        if (observed.runId !== report.runId || observed.evidenceDir !== report.evidenceDir
          || !path.isAbsolute(report.cliBin) || !lstatSync(report.cliBin).isFile() || lstatSync(report.cliBin).isSymbolicLink()
          || realpathSync(report.cliBin) !== report.cliBin
          || observed.binSha256 !== createHash('sha256').update(readFileSync(report.cliBin)).digest('hex')) throw new Error('Console run/bin binding differs.');
        if (consoleLeaf) validateConsoleRoundtripFiles(observed);
        else if (recoveryLeaf || itemsLeaf || selectionLeaf || editLeaf || identityLeaf || rulesLeaf || preflightLeaf || previewLeaf) {
          // A fresh wrapper/run label cannot renew old recovery observations.
          const window = [report.startedAt, observed.startedAt, observed.finishedAt, report.finishedAt];
          if (window.some((value) => typeof value !== 'string' || !Number.isFinite(Date.parse(value))
            || new Date(value).toISOString() !== value)
            || window.some((value, index) => index > 0 && Date.parse(window[index - 1]) > Date.parse(value))) {
            throw new Error('Recovery observations are outside the aggregate run window.');
          }
          if (previewLeaf) validateCollectionPublishPreviewFiles(observed);
          else if (preflightLeaf) validateCollectionPublishPreflightFiles(observed);
          else if (rulesLeaf) validateCollectionRulesFiles(observed);
          else if (identityLeaf) validateCollectionIdentityFiles(observed);
          else if (editLeaf) validateCollectionEditFiles(observed);
          else if (selectionLeaf) validateCollectionSelectionFiles(observed);
          else if (itemsLeaf) validateCollectionItemsFiles(observed);
          else validateCollectionRecoveryFiles(observed);
        }
        else if (collectionLeaf) validateCollectionLifecycleFiles(observed);
        else validateManagementFiles(observed);
      }
      recomputed = commandLeaf ? evaluateCommandCase(commandLeaf, evidence.observations)
        : versionLeaf ? evaluateVersionLifecycle(versionLeaf.resourceKind, evidence.observations)
          : syncLeaf ? evaluateResourceSyncCase(syncLeaf.id, evidence.observations)
            : managementLeaf ? evaluateResourceManagementCase(managementLeaf.id, evidence.observations)
              : recoveryLeaf ? evaluateCollectionRecovery(evidence.observations)
                : itemsLeaf ? evaluateCollectionItems(evidence.observations)
                  : selectionLeaf ? evaluateCollectionSelection(evidence.observations)
                    : editLeaf ? evaluateCollectionEdits(evidence.observations)
                      : identityLeaf ? evaluateCollectionIdentity(evidence.observations)
                        : rulesLeaf ? evaluateCollectionRules(evidence.observations)
                          : preflightLeaf ? evaluateCollectionPublishPreflight(evidence.observations)
                            : previewLeaf ? evaluateCollectionPublishPreview(evidence.observations)
                : collectionLeaf ? evaluateCollectionLifecycleCase(collectionLeaf.id, evidence.observations)
                : evaluateConsoleRoundtripCase(consoleLeaf.id, evidence.observations);
    } catch { throw new Error(`${failure}: malformed observations`); }
    if (recomputed.status !== 'PASS' || !isDeepStrictEqual(recomputed.assertions, result.assertions)) throw new Error(failure);
  }
  if (result.id === 'POLICY.COLLECTION.SELECTED_TEMPLATES') {
    const samples = evidence.templateResults;
    if (!Array.isArray(samples) || samples.length < 2 || new Set(samples.map((item) => item.templateId)).size !== samples.length
      || samples.some((item) => !text(item.templateId) || item.status !== 'PASS' || item.exitCode !== 0)
      || !isDeepStrictEqual(samples, result.templateResults)
      || result.assertions.find((item) => item.id === 'all-selected-created')?.actual !== samples.length) {
      throw new Error('Selected-template failures or missing individual outcomes cannot be replaced by a summary PASS.');
    }
  }
  if (result.id === 'POLICY.TTY.REAL_PAGINATION') {
    const observed = evidence.observations;
    if (!object(observed) || !isDeepStrictEqual(observed, result.observations)
      || !Number.isInteger(observed.catalogCount) || observed.catalogCount <= 20
      || !Array.isArray(observed.matchedPrompts)
      || observed.matchedPrompts.filter((prompt) => prompt === '授权策略模板（第 1/').length !== 2
      || observed.matchedPrompts.filter((prompt) => prompt === '授权策略模板（第 2/').length !== 1
      || observed.completedSteps !== observed.expectedSteps) {
      throw new Error('Real TTY pagination PASS lacks a sufficient catalog and observed next/previous prompts.');
    }
  }
  // A matching hash binds a report to raw bytes, not to independent business truth.
  // Future cases must add an explicit source validator rather than inherit a default PASS.
  if (!commandLeaf && !versionLeaf && !syncLeaf && !managementLeaf && !consoleLeaf && !collectionLeaf && !recoveryLeaf && !itemsLeaf && !selectionLeaf && !editLeaf && !identityLeaf && !rulesLeaf && !preflightLeaf && !previewLeaf && result.id !== 'POLICY.COLLECTION.SELECTED_TEMPLATES'
    && result.id !== 'POLICY.TTY.REAL_PAGINATION') throw new Error(`PRODUCT_VALIDATOR_UNREGISTERED: ${result.id}`);
}

/** Runtime uses the source catalog; the optional JS argument supports isolated contract tests, never report input. */
export function validateSuiteCases(report, script, catalog = acceptanceCatalog) {
  validateCatalog(catalog);
  const expected = catalog.filter((item) => item.script === script && item.kind === 'product-case');
  if (expected.length === 0) throw new Error(`Unknown business acceptance producer: ${script}`);
  if (!object(report) || report.schemaVersion !== 1 || !Array.isArray(report.cases) || report.cases.length === 0) {
    throw new Error(`Invalid structured child report: ${script}`);
  }
  const seen = new Set();
  for (const result of report.cases) {
    const descriptor = catalog.find((item) => item.id === result?.id && item.script === script && item.kind !== 'legacy-suite');
    if (!descriptor || seen.has(result.id)) throw new Error(`Unknown/duplicate case in ${script}`);
    seen.add(result.id);
    validateCaseShape(result, descriptor);
  }
  const missing = expected.filter((item) => !seen.has(item.id));
  if (missing.length) throw new Error(`Missing cases from ${script}: ${missing.map((item) => item.id).join(', ')}`);
  return report.cases;
}

/** Both modes retain exact evidence checks; development evidence can never authorize publication. */
export function validateCandidateReport(report, expectedBinding) {
  validateCatalog();
  if (!object(expectedBinding) || !['sourceFingerprint', 'tarballSha512', 'cliBin', 'candidateDir'].every((key) => text(expectedBinding[key]))
    || !['development', 'release'].includes(expectedBinding.purpose) || !validSourceRevision(expectedBinding.sourceRevision)
    || (expectedBinding.purpose === 'release') !== expectedBinding.sourceRevision.clean) {
    throw new Error('Expected candidate binding must come from independent candidate verification.');
  }
  if (!object(report) || report.schemaVersion !== 2 || report.environment !== 'dev'
    || report.releaseEvidence !== (expectedBinding.purpose === 'release')) {
    throw new Error('Acceptance must be a schemaVersion 2 real-dev candidate report with the actual candidate purpose.');
  }
  for (const key of ['sourceFingerprint', 'tarballSha512', 'cliBin', 'purpose']) {
    if (report[key] !== expectedBinding[key]) throw new Error(`Acceptance candidate binding mismatch: ${key}`);
  }
  if (!sameSourceRevision(report.sourceRevision, expectedBinding.sourceRevision)) throw new Error('Acceptance candidate binding mismatch: sourceRevision');
  if (report.manifestSha256 !== manifestSha256()) throw new Error('Acceptance manifest changed or is not the locally approved catalog.');
  if (!text(report.runId) || !/^[A-Za-z0-9-]{1,80}$/u.test(report.runId)
    || report.evidenceDir !== path.join(expectedBinding.candidateDir, 'evidence', report.runId)
    || !existsSync(report.evidenceDir) || !lstatSync(report.evidenceDir).isDirectory()
    || realpathSync(report.evidenceDir) !== report.evidenceDir) throw new Error('Acceptance evidence directory is not bound to this candidate run.');
  const now = expectedBinding.now instanceof Date ? expectedBinding.now.getTime() : expectedBinding.now ?? Date.now();
  const maxAge = Math.min(expectedBinding.maxAgeMs ?? maximumEvidenceAgeMs, maximumEvidenceAgeMs);
  const started = Date.parse(report.startedAt);
  const finished = Date.parse(report.finishedAt);
  if (!text(report.startedAt) || !text(report.finishedAt) || !Number.isFinite(now) || !Number.isFinite(maxAge) || maxAge <= 0 || !Number.isFinite(started) || !Number.isFinite(finished)
    || started > finished || finished > now || now - started > maxAge) {
    throw new Error('Acceptance evidence has invalid, future, reversed or stale timestamps.');
  }
  if (!Array.isArray(report.cases) || report.cases.length === 0) throw new Error('Acceptance case list is empty or missing.');
  const seen = new Set();
  for (const result of report.cases) {
    const descriptor = acceptanceCatalog.find((item) => item.id === result?.id);
    if (!descriptor || seen.has(result.id)) throw new Error(`Unknown/duplicate acceptance case: ${result?.id}`);
    seen.add(result.id);
    validateCaseShape(result, descriptor);
    if (descriptor.kind === 'product-case' && result.status === 'PASS') validateProductTrace(result, report);
  }
  const missing = acceptanceCatalog.filter((item) => !seen.has(item.id));
  if (missing.length) throw new Error(`Missing acceptance cases: ${missing.map((item) => item.id).join(', ')}`);
  if (report.scope !== undefined && report.scope !== 'full') throw new Error('Scoped development evidence cannot satisfy full candidate acceptance.');
  const incomplete = report.cases.filter((item) => acceptanceCatalog.find((entry) => entry.id === item.id).required && item.status !== 'PASS');
  if (incomplete.length) throw new Error(`Required acceptance cases are not PASS: ${incomplete.map((item) => `${item.id}=${item.status}`).join(', ')}`);
  return { valid: true, caseCount: report.cases.length, manifestSha256: manifestSha256() };
}

/** The release boundary has no mode override: a valid development report remains non-release evidence. */
export function validateAcceptanceReport(report, expectedBinding) {
  if (expectedBinding?.purpose !== 'release') throw new Error('A development candidate cannot authorize publication.');
  return validateCandidateReport(report, expectedBinding);
}
