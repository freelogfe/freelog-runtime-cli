/** Local record consistency, not identity authentication or proof of business completeness. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { acceptanceCatalog } from '../../test/acceptance/catalog.mjs';
import { deliveryContractSha256, deliveryRules } from './delivery-contract.mjs';
import { sameSourceRevision, validSourceRevision } from './source-revision.mjs';

const text = (value) => typeof value === 'string' && value.trim().length > 0;
const identity = (value) => text(value) && value.length <= 200 && !/[\s\u0000-\u001f]/u.test(value);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const maxAgeMs = 24 * 60 * 60 * 1000;
function requireValue(condition, code) { if (!condition) throw new Error(code); }
function shape(value, keys, code) {
  requireValue(object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), code);
}
function sameSet(actual, expected, code) {
  requireValue(Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === actual.length
    && actual.every((value) => expected.includes(value)), code);
}
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function regularBytes(file, root, code) {
  requireValue(typeof file === 'string' && path.isAbsolute(file) && path.resolve(file) === file && inside(root, file)
    && existsSync(file) && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink()
    && realpathSync(file) === file && lstatSync(file).size <= 2_000_000, code);
  return readFileSync(file);
}
function binding(value, expected) {
  requireValue(value.candidateFile === expected.candidateFile && value.sourceFingerprint === expected.candidate.sourceFingerprint
    && value.purpose === expected.candidate.purpose && sameSourceRevision(value.sourceRevision, expected.candidate.sourceRevision)
    && value.tarballSha512 === expected.candidate.tarballSha512 && value.contractSha256 === deliveryContractSha256(), 'DELIVERY_BINDING');
}
function timeRange(startedAt, finishedAt, lowerBound, upperBound, now) {
  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  requireValue(text(startedAt) && text(finishedAt) && Number.isFinite(now) && Number.isFinite(started) && Number.isFinite(finished)
    && started >= lowerBound && started <= finished && finished <= upperBound && upperBound <= now
    && now - started <= maxAgeMs, 'DELIVERY_TIME');
}
function validateContract() {
  const product = acceptanceCatalog.filter((item) => item.kind !== 'legacy-suite').map((item) => item.id);
  requireValue(Array.isArray(deliveryRules) && deliveryRules.length > 0
    && deliveryRules.every((rule) => object(rule) && identity(rule.id)
      && Array.isArray(rule.designPaths) && rule.designPaths.length > 0
      && rule.designPaths.every(text) && new Set(rule.designPaths).size === rule.designPaths.length
      && Array.isArray(rule.caseIds) && rule.caseIds.length > 0 && rule.caseIds.every(identity)
      && new Set(rule.caseIds).size === rule.caseIds.length)
    && new Set(deliveryRules.map((rule) => rule.id)).size === deliveryRules.length, 'DELIVERY_CONTRACT_RULES');
  // Rules and observations have distinct identities. Shared leaf cases may prove several rules.
  sameSet([...new Set(deliveryRules.flatMap((rule) => rule.caseIds))], product, 'DELIVERY_CONTRACT_CASES');
}

function traceability(rules, repoRoot) {
  requireValue(Array.isArray(rules), 'DELIVERY_RULES');
  sameSet(rules.map((item) => item?.ruleId), deliveryRules.map((item) => item.id), 'DELIVERY_RULES');
  for (const rule of rules) {
    shape(rule, ['ruleId', 'designs', 'caseIds'], 'DELIVERY_RULE_SHAPE');
    const contract = deliveryRules.find((item) => item.id === rule.ruleId);
    sameSet(rule.caseIds, contract.caseIds, 'DELIVERY_RULE_CASES');
    requireValue(Array.isArray(rule.designs), 'DELIVERY_DESIGNS');
    sameSet(rule.designs.map((item) => item?.path), contract.designPaths, 'DELIVERY_DESIGNS');
    for (const design of rule.designs) {
      shape(design, ['path', 'sha256'], 'DELIVERY_DESIGN_SHAPE');
      const file = path.resolve(repoRoot, design.path);
      const bytes = regularBytes(file, repoRoot, 'DELIVERY_DESIGN_PATH');
      requireValue(digest(bytes) === design.sha256, 'DELIVERY_DESIGN_HASH');
    }
  }
}

function reviewEvidence(entry, expected, authorId, recordedAt) {
  shape(entry, ['lane', 'reviewerId', 'verdict', 'evidenceRef'], 'DELIVERY_REVIEW_SHAPE');
  shape(entry.evidenceRef, ['path', 'sha256'], 'DELIVERY_REVIEW_REF');
  const bytes = regularBytes(entry.evidenceRef.path, path.dirname(expected.candidateFile), 'DELIVERY_REVIEW_PATH');
  requireValue(digest(bytes) === entry.evidenceRef.sha256, 'DELIVERY_REVIEW_HASH');
  let raw;
  try { raw = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('DELIVERY_REVIEW_JSON'); }
  shape(raw, ['schemaVersion', 'candidateFile', 'purpose', 'sourceRevision', 'sourceFingerprint', 'tarballSha512', 'contractSha256', 'authorId', 'reviewerId',
    'lane', 'verdict', 'startedAt', 'finishedAt', 'ruleIds', 'findings', 'report'], 'DELIVERY_REVIEW_RAW_SHAPE');
  requireValue(raw.schemaVersion === 2, 'DELIVERY_REVIEW_SCHEMA');
  binding(raw, expected);
  requireValue(raw.authorId === authorId && raw.lane === entry.lane && raw.reviewerId === entry.reviewerId
    && raw.verdict === entry.verdict && text(raw.report), 'DELIVERY_REVIEW_RECORD');
  requireValue(identity(raw.reviewerId), 'DELIVERY_REVIEW_ID');
  requireValue(raw.reviewerId !== authorId, 'DELIVERY_REVIEW_SELF');
  const verdict = entry.lane === 'code' ? 'APPROVE' : 'CLEAR';
  requireValue(entry.verdict === verdict, 'DELIVERY_REVIEW_VERDICT');
  sameSet(raw.ruleIds, deliveryRules.map((item) => item.id), 'DELIVERY_REVIEW_SCOPE');
  timeRange(raw.startedAt, raw.finishedAt, Date.parse(expected.candidate.createdAt), recordedAt, expected.now);
  requireValue(Array.isArray(raw.findings) && raw.findings.every((finding) => object(finding) && text(finding.id)
    && text(finding.description) && finding.status === 'RESOLVED' && text(finding.resolution)), 'DELIVERY_REVIEW_FINDINGS');
  return raw.reviewerId;
}

/** Does not mark any case PASS: validateAcceptanceReport remains a separate mandatory gate. */
export function validateDeliveryReport(report, expected) {
  requireValue(object(expected) && object(expected.candidate) && text(expected.repoRoot) && text(expected.candidateFile), 'DELIVERY_EXPECTED_BINDING');
  requireValue(validSourceRevision(expected.candidate.sourceRevision) && ['development', 'release'].includes(expected.candidate.purpose)
    && (expected.candidate.purpose === 'release') === expected.candidate.sourceRevision.clean, 'DELIVERY_EXPECTED_BINDING');
  shape(report, ['schemaVersion', 'candidateFile', 'purpose', 'sourceRevision', 'sourceFingerprint', 'tarballSha512', 'contractSha256', 'createdAt',
    'authorId', 'rules', 'reviews'], 'DELIVERY_SHAPE');
  requireValue(report.schemaVersion === 2 && identity(report.authorId), 'DELIVERY_SCHEMA');
  validateContract();
  binding(report, expected);
  const recordedAt = Date.parse(report.createdAt);
  timeRange(report.createdAt, report.createdAt, Date.parse(expected.candidate.createdAt), recordedAt, expected.now);
  traceability(report.rules, realpathSync(expected.repoRoot));
  requireValue(Array.isArray(report.reviews), 'DELIVERY_REVIEW_LANES');
  sameSet(report.reviews.map((item) => item?.lane), ['code', 'architecture'], 'DELIVERY_REVIEW_LANES');
  const reviewers = report.reviews.map((entry) => reviewEvidence(entry, expected, report.authorId, recordedAt));
  requireValue(new Set(reviewers).size === 2, 'DELIVERY_REVIEW_INDEPENDENCE');
  return { valid: true, ruleCount: deliveryRules.length, productAcceptanceEvaluated: false };
}

export function readDeliveryEvidence(verified, { repoRoot, now = Date.now() }) {
  const directory = path.dirname(verified.candidateFile);
  const file = path.join(directory, 'delivery.json');
  const bytes = regularBytes(file, directory, 'DELIVERY_MISSING');
  let report;
  try { report = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('DELIVERY_JSON'); }
  const validation = validateDeliveryReport(report, { ...verified, repoRoot, now });
  return { report, validation };
}
