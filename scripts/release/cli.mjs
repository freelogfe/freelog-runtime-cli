#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCandidate, prepareCandidate, publishCandidate } from './core.mjs';

const HELP = `Fixed-candidate CLI release (no version changes, login or Git operations)
  node scripts/release/cli.mjs prepare
  node scripts/release/cli.mjs check --candidate <candidate.json-or-directory>
  node scripts/release/cli.mjs publish --candidate <candidate.json-or-directory>
prepare runs the mandatory local gates and installs one fixed tarball.
purpose is automatic: uncommitted effective inputs produce development-only candidates.
check requires a release candidate, delivery.json with bound independent reviews AND real-dev acceptance.json;
it also reads exact-source GitHub CI/current protection/review facts, rejecting unavailable or unsupported policy.
It is read-only and rejects missing, incomplete, stale or mismatched evidence; no local CI approval file is accepted.
publish is the only npm writer; browser authentication is completed by the user.
`;

export function parseArguments(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { action: 'help' };
  const [action, ...parameters] = args;
  const rest = parameters[0] === '--' ? parameters.slice(1) : parameters;
  if (!['prepare', 'check', 'publish'].includes(action)) throw new Error(`Unknown release action: ${action}`);
  if (action === 'prepare') {
    if (rest.length) throw new Error('prepare accepts no skip gates, destination overrides or npm flags');
    return { action };
  }
  if (rest.length !== 2 || rest[0] !== '--candidate' || !rest[1] || rest[1].startsWith('--')) {
    throw new Error(`${action} requires exactly --candidate <path>; arbitrary npm flags are not allowed`);
  }
  return { action, candidate: rest[1] };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  if (args.action === 'help') { process.stdout.write(HELP); return; }
  if (args.action === 'prepare') {
    const result = prepareCandidate();
    process.stdout.write(`Candidate prepared (${result.candidate.purpose}; NOT dev accepted or release approved): ${result.candidateFile}\nSource commit: ${result.candidate.sourceRevision.commit ?? 'none'}\nInstalled CLI: ${result.candidate.cliBin}\n`);
  } else if (args.action === 'check') {
    const result = await checkCandidate(args.candidate);
    process.stdout.write(`Candidate local evidence accepted: ${result.candidateFile}\nSource commit: ${result.candidate.sourceRevision.commit}\nCases: ${result.validation.caseCount}\n`);
  } else {
    const result = await publishCandidate(args.candidate);
    process.stdout.write(`Registry bytes and installed package verified: ${result.publication.version}\nTag must reference source commit ${result.candidate.sourceRevision.commit}; record later audit/handoff separately. No Git operation was performed.\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`RELEASE BLOCKED: ${error.message}`); process.exitCode = 1; });
}
