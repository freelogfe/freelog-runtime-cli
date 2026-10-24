/** Recompute fixed local command observations; reports do not supply the expected contract. */
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { bindingSelectorBytes, commandParameterCases, logoutSelectorContents } from './command-parameter-cases.mjs';

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

function logoutAssertions(leaf, observed, normal, child) {
  const { fixture, root, removed } = leaf.logout;
  const work = observed.workRoot;
  const home = observed.home;
  const rootsValid = typeof work === 'string' && path.isAbsolute(work) && path.basename(work).startsWith('freelog-command-parameters-')
    && typeof home === 'string' && path.isAbsolute(home) && home === path.join(observed.controls ?? '', 'home');
  const target = rootsValid && removed ? path.join(root === 'work' ? work : home, removed) : null;
  const expectedOutput = target ? `已退出登录：${target}\n` : leaf.expected.errorJson;
  let output = child.stdout;
  if (!removed) { try { output = JSON.parse(child.stdout); } catch { output = { invalidJson: true }; } }
  const state = (before, after, selectedRoot) => {
    const required = selectedRoot === 'work'
      ? ['project/.freelog/1.json', 'project/.freelog/1.version.json', 'project/.freelog/2.json', 'project/.freelog/collection-forms/dev/synthetic-collection.json']
      : ['keep.txt'];
    const selectors = selectedRoot === 'work' ? ['.freelog/auth', 'project/.freelog/auth', 'other/.freelog/auth'] : ['.freelog/auth-default.json'];
    const hasSelectors = selectedRoot === 'work' ? !['none', 'fallback'].includes(fixture) : !['none', 'global-missing'].includes(fixture);
    const complete = completeSnapshot(before) && completeSnapshot(after)
      && required.every((name) => before.some((item) => item.path === name && item.kind === 'file'))
      && selectors.every((name) => {
        const entry = before.find((item) => item.path === name);
        if (!hasSelectors) return entry === undefined;
        const bytes = selectedRoot === 'home' ? logoutSelectorContents.global
          : fixture === 'legacy' && name === 'project/.freelog/auth' ? logoutSelectorContents.legacy : logoutSelectorContents.workspace;
        return entry?.kind === 'file' && entry.size === Buffer.byteLength(bytes)
          && entry.sha256 === createHash('sha256').update(bytes).digest('hex');
      });
    return [{ complete: true, entries: before?.filter((item) => !(root === selectedRoot && item.path === removed)) }, { complete, entries: after }];
  };
  let trace;
  try { trace = observed.logoutLog.trim().split('\n').map(JSON.parse); } catch { trace = { invalidTrace: true }; }
  return [
    ['command-input', { validRoots: true, argv: [...leaf.action.argv], stdin: '', cwd: rootsValid ? (fixture === 'cwd' ? work : path.join(work, 'project/nested/deep')) : null },
      { validRoots: rootsValid, argv: observed.argv, stdin: observed.stdin, cwd: observed.cwd }],
    ['normal-exit', { exitCode: leaf.expected.exitCode, signal: null, error: null, timedOut: false }, normal],
    ['exact-output', expectedOutput, output],
    ['stderr-empty', '', child.stderr ?? null],
    ['workspace-state', ...state(observed.before, observed.after, 'work')],
    ['home-state', ...state(observed.homeBefore, observed.homeAfter, 'home')],
    ['network-unused', { guard: 'local-parameter-no-network-v1', ready: true, finished: true, attempts: 0, blocked: [] }, networkObservation(observed.networkLog ?? '')],
    ['logout-guard', [
      { schemaVersion: 1, event: 'ready', guard: 'logout-local-boundary-v1' },
      { schemaVersion: 1, event: 'keyring-replaced' },
      ...(removed ? [{ schemaVersion: 1, event: 'unlink', root, path: removed }] : []),
      { schemaVersion: 1, event: 'finished', blocked: 0 },
    ], trace],
  ];
}

export function evaluateCommandCase(leaf, observed) {
  if (!commandParameterCases.some((item) => item === leaf)) throw new Error('Unknown local parameter contract.');
  const child = observed.result ?? {};
  const normal = { exitCode: child.status ?? null, signal: child.signal ?? null,
    error: child.error ? String(child.error.message ?? child.error) : null, timedOut: child.timedOut === true || child.error?.code === 'ETIMEDOUT' };
  let errorJson;
  try { errorJson = JSON.parse(child.stdout); } catch { errorJson = { invalidJson: true }; }
  let expectedErrorJson = leaf.expected.errorJson;
  if (leaf.authBinding) {
    const global = leaf.authBinding.scope === 'home';
    const selectorPath = path.join((global ? observed.home : observed.workRoot) ?? '', global ? '.freelog/auth-default.json' : '.freelog/auth');
    expectedErrorJson = { code: 'AUTH_INVALID', message: `凭据选择器损坏：${selectorPath}` };
  }
  const expectedNetwork = { guard: 'local-parameter-no-network-v1', ready: true, finished: true, attempts: 0, blocked: [] };
  const pairs = leaf.logout ? logoutAssertions(leaf, observed, normal, child) : [
    ['command-input', { argv: [...leaf.action.argv], stdin: leaf.action.stdin }, { argv: observed.argv ?? null, stdin: observed.stdin ?? null }],
    ['normal-rejection', { exitCode: leaf.expected.exitCode, signal: null, error: null, timedOut: false }, normal],
    ['exact-error-json', expectedErrorJson, errorJson],
    ['stderr-empty', leaf.expected.stderr, child.stderr ?? null],
    ['local-unchanged', { complete: true, entries: observed.before },
      { complete: completeSnapshot(observed.before) && completeSnapshot(observed.after), entries: observed.after }],
    ['network-unused', expectedNetwork, networkObservation(observed.networkLog ?? '')],
  ];
  if (leaf.authBinding) pairs.push(...bindingAssertions(leaf, observed));
  const assertions = pairs.map(([id, expected, actual]) => ({ id, passed: isDeepStrictEqual(expected, actual), expected, actual }));
  const status = assertions.every((item) => item.passed) ? 'PASS' : 'FAIL';
  return { id: leaf.id, status, assertions,
    ...(status === 'PASS' ? {} : { reason: `Local command contract mismatched: ${assertions.filter((item) => !item.passed).map((item) => item.id).join(', ')}` }),
    // A command's expected rejection (exit 1) is separate from the producer's successful
    // verification. Logout success is exit 0; both branches retain exact process observations.
    observations: { ...observed, result: { ...child, error: normal.error, errorCode: child.error?.code ?? null,
      timedOut: normal.timedOut }, ...(!leaf.logout?.removed ? { parsedError: errorJson } : {}) } };
}

function bindingAssertions(leaf, observed) {
  const { scope, key } = leaf.authBinding;
  const fileEntry = (name, bytes) => ({ path: name, kind: 'file', size: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') });
  let events;
  try { events = observed.accountLog.trim().split('\n').map(JSON.parse); } catch { events = { invalidTrace: true }; }
  const rootsValid = typeof observed.workRoot === 'string' && path.isAbsolute(observed.workRoot)
    && path.basename(observed.workRoot).startsWith('freelog-command-parameters-') && observed.cwd === observed.workRoot
    && observed.home === path.join(observed.controls ?? '', 'home');
  return [
    ['home-unchanged', { complete: true, entries: observed.homeBefore },
      { complete: completeSnapshot(observed.homeBefore) && completeSnapshot(observed.homeAfter), entries: observed.homeAfter }],
    ['binding-fixture', { rootsValid: true, requiredFiles: true,
      workspace: scope === 'work' ? fileEntry('.freelog/auth', bindingSelectorBytes(key)) : null,
      global: fileEntry('.freelog/auth-default.json', bindingSelectorBytes(scope === 'home' ? key : 'v1/dev/8', 8)) },
    { rootsValid, requiredFiles: ['.freelog/1.json', '.freelog/1.version.json', '.freelog/2.json'].every((name) => observed.before?.some((item) => item.path === name && item.kind === 'file')),
      workspace: observed.before?.find((item) => item.path === '.freelog/auth') ?? null,
      global: observed.homeBefore?.find((item) => item.path === '.freelog/auth-default.json') ?? null }],
    ['account-guard', [
      { schemaVersion: 1, event: 'ready', guard: 'account-selector-boundary-v1' },
      { schemaVersion: 1, event: 'keyring-replaced' },
      { schemaVersion: 1, event: 'selector-read', root: scope, path: scope === 'work' ? '.freelog/auth' : '.freelog/auth-default.json' },
      { schemaVersion: 1, event: 'finished', blocked: 0 },
    ], events],
  ];
}
