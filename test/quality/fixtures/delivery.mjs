/** Synthetic local records for validator tests, never real independent-review evidence. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deliveryContractSha256, deliveryRules } from '../../../scripts/release/delivery-contract.mjs';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
export function seedDeliveryDesigns(root) {
  for (const file of new Set(deliveryRules.flatMap((rule) => rule.designPaths))) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), `# Synthetic test design: ${file}\n`);
  }
}
export function writeDeliveryFixture(prepared, root, now = Date.now()) {
  const binding = { candidateFile: prepared.candidateFile, purpose: prepared.candidate.purpose, sourceRevision: prepared.candidate.sourceRevision,
    sourceFingerprint: prepared.candidate.sourceFingerprint,
    tarballSha512: prepared.candidate.tarballSha512, contractSha256: deliveryContractSha256() };
  const time = new Date(now).toISOString();
  const report = { schemaVersion: 2, ...binding, createdAt: time, authorId: '/fixture/author',
    rules: deliveryRules.map((rule) => ({ ruleId: rule.id, caseIds: [...rule.caseIds],
      designs: rule.designPaths.map((file) => ({ path: file, sha256: sha256(readFileSync(path.join(root, file))) })) })),
    reviews: ['code', 'architecture'].map((lane) => {
      const raw = { schemaVersion: 2, ...binding, authorId: '/fixture/author', reviewerId: `/fixture/${lane}`,
        lane, verdict: lane === 'code' ? 'APPROVE' : 'CLEAR', startedAt: time, finishedAt: time,
        ruleIds: deliveryRules.map((rule) => rule.id), findings: [], report: 'Synthetic fixture: validator unit coverage only; no real review happened.' };
      const file = path.join(path.dirname(prepared.candidateFile), 'review-evidence', `${lane}.json`);
      writeJson(file, raw);
      return { lane, reviewerId: raw.reviewerId, verdict: raw.verdict, evidenceRef: { path: file, sha256: sha256(readFileSync(file)) } };
    }),
  };
  writeJson(path.join(path.dirname(prepared.candidateFile), 'delivery.json'), report);
  return report;
}
