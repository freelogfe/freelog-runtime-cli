/** Recompute fixed local-rejection observations; neither producer nor report supplies the expected contract. */
import { isDeepStrictEqual } from 'node:util';
import { commandParameterCases } from './command-parameter-cases.mjs';

function networkObservation(raw) {
  try {
    const events = raw.trim().split('\n').map(JSON.parse);
    const first = events[0];
    const last = events.at(-1);
    const blocked = events.slice(1, -1);
    const valid = first?.schemaVersion === 1 && first.event === 'ready' && first.guard === 'local-parameter-no-network-v1'
      && Object.keys(first).length === 3 && last?.schemaVersion === 1 && last.event === 'finished'
      && Object.keys(last).length === 3 && Number.isInteger(last.attempts)
      && blocked.every((item) => item?.schemaVersion === 1 && item.event === 'blocked' && typeof item.kind === 'string' && Object.keys(item).length === 3)
      && last.attempts === blocked.length;
    if (!valid) return { valid: false };
    return { guard: first.guard, ready: true, finished: true, attempts: last.attempts, blocked: blocked.map((item) => item.kind) };
  } catch { return { valid: false }; }
}

function completeSnapshot(value) {
  return Array.isArray(value) && value.length > 0 && new Set(value.map((item) => item?.path)).size === value.length
    && value.every((item) => item && typeof item.path === 'string' && item.path.length > 0
      && (item.kind === 'directory' ? Object.keys(item).length === 2
        : item.kind === 'file' && Object.keys(item).length === 4 && Number.isInteger(item.size) && item.size >= 0
          && /^[a-f0-9]{64}$/u.test(item.sha256 ?? '')));
}

export function evaluateCommandCase(leaf, observed) {
  if (!commandParameterCases.some((item) => item === leaf)) throw new Error('Unknown local parameter contract.');
  const child = observed.result ?? {};
  const normal = { exitCode: child.status ?? null, signal: child.signal ?? null,
    error: child.error ? String(child.error.message ?? child.error) : null, timedOut: child.timedOut === true || child.error?.code === 'ETIMEDOUT' };
  let errorJson;
  try { errorJson = JSON.parse(child.stdout); } catch { errorJson = { invalidJson: true }; }
  const expectedNetwork = { guard: 'local-parameter-no-network-v1', ready: true, finished: true, attempts: 0, blocked: [] };
  const pairs = [
    ['command-input', { argv: [...leaf.action.argv], stdin: leaf.action.stdin }, { argv: observed.argv ?? null, stdin: observed.stdin ?? null }],
    ['normal-rejection', { exitCode: leaf.expected.exitCode, signal: null, error: null, timedOut: false }, normal],
    ['exact-error-json', leaf.expected.errorJson, errorJson],
    ['stderr-empty', leaf.expected.stderr, child.stderr ?? null],
    ['local-unchanged', { complete: true, entries: observed.before },
      { complete: completeSnapshot(observed.before) && completeSnapshot(observed.after), entries: observed.after }],
    ['network-unused', expectedNetwork, networkObservation(observed.networkLog ?? '')],
  ];
  const assertions = pairs.map(([id, expected, actual]) => ({ id, passed: isDeepStrictEqual(expected, actual), expected, actual }));
  const status = assertions.every((item) => item.passed) ? 'PASS' : 'FAIL';
  return { id: leaf.id, status, assertions,
    ...(status === 'PASS' ? {} : { reason: `Local rejection mismatched: ${assertions.filter((item) => !item.passed).map((item) => item.id).join(', ')}` }),
    // The command intentionally exits 1; the producer exits 0 only when these exact rejection
    // assertions pass. Do not attach command exit 1 as a successful producer process record.
    observations: { ...observed, result: { ...child, error: normal.error, errorCode: child.error?.code ?? null,
      timedOut: normal.timedOut }, parsedError: errorJson } };
}
