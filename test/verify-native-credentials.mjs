#!/usr/bin/env node
/** Bounded synthetic capability probe; never a product acceptance producer. */
import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireInstalledCli } from './verify-command-parameters.mjs';

const account = 'synthetic-probe';
const first = 'freelog-public-synthetic-probe-first';
const second = 'freelog-public-synthetic-probe-second';
const absent = (value) => value === null || value === undefined;

/** Injection is only for offline quality tests. No enumeration or production service access. */
export function checkNativeCredentialEntry(Entry, onProgress = () => {}) {
  const service = `freelog-cli-native-probe-${randomUUID()}`;
  const result = { status: 'BLOCKED', phase: 'ownership', service, account,
    checks: { saved: false, read: false, overwritten: false, deleted: false, absent: false },
    cleanup: { attempted: false, deleted: false, absent: false } };
  let entry, attemptedWrite = false, persistenceFailed = false;
  const progress = (phase) => {
    result.phase = phase;
    try { onProgress(structuredClone(result)); }
    catch { persistenceFailed = true; throw new Error('Probe progress unavailable.'); }
  };
  try {
    progress('ownership'); progress('construct');
    entry = new Entry(service, account);
    progress('set'); attemptedWrite = true;
    entry.setPassword(first); result.checks.saved = true;
    result.status = 'FAIL'; progress('get');
    result.checks.read = entry.getPassword() === first;
    if (!result.checks.read) return result;
    progress('overwrite'); entry.setPassword(second);
    progress('get-overwrite');
    result.checks.overwritten = entry.getPassword() === second;
    if (!result.checks.overwritten) return result;
    progress('delete'); result.checks.deleted = entry.deleteCredential() === true;
    if (!result.checks.deleted) return result;
    progress('get-absent'); result.checks.absent = absent(entry.getPassword());
  } catch {
    // A first-write exception cannot establish native capability; never expose raw diagnostics.
  } finally {
    if (attemptedWrite) {
      result.cleanup.attempted = true;
      try { progress('cleanup'); } catch { /* Cleanup of our attempted key still runs once. */ }
      try {
        const deleted = entry.deleteCredential();
        result.cleanup.deleted = deleted === true || deleted === false;
        result.cleanup.absent = absent(entry.getPassword());
      } catch { /* Preserve the failure and only this probe's identifier. */ }
      if (!result.cleanup.deleted || !result.cleanup.absent) {
        result.status = 'FAIL'; result.phase = 'cleanup'; result.cleanup.service = service;
      }
    }
    if (persistenceFailed) { result.status = 'FAIL'; result.phase = 'report-persist'; }
    else if (Object.values(result.checks).every(Boolean) && result.cleanup.deleted && result.cleanup.absent) {
      result.status = 'PASS'; result.phase = 'complete';
    }
  }
  return result;
}

/** Append-only JSONL preserves durable ownership even if a later phase is interrupted. */
export function runNativeCredentialProbe({ env = process.env, output,
  loadEntry = (bin) => createRequire(bin)('@napi-rs/keyring').Entry } = {}) {
  if (typeof output !== 'string' || !path.isAbsolute(output)
    || path.resolve(output) !== output || realpathSync(path.dirname(output)) !== path.dirname(output)) {
    throw new Error('A fresh absolute report path with an existing canonical parent is required.');
  }
  const fd = openSync(output, 'wx', 0o600);
  const report = { status: 'BLOCKED', phase: 'installed-bin', bin: null, binSha256: null,
    platform: `${process.platform}/${process.arch}`, node: process.version,
    startedAt: new Date().toISOString(), finishedAt: null,
    checks: { saved: false, read: false, overwritten: false, deleted: false, absent: false },
    cleanup: { attempted: false, deleted: false, absent: false } };
  let persistenceFailed = false;
  const persist = (progress = {}) => {
    Object.assign(report, progress);
    try { writeFileSync(fd, `${JSON.stringify(report)}\n`); fsyncSync(fd); }
    catch { persistenceFailed = true; throw new Error('Probe progress unavailable.'); }
  };
  try {
    persist();
    const installed = requireInstalledCli(env);
    report.bin = installed.cliBin; report.binSha256 = installed.binSha256;
    Object.assign(report, checkNativeCredentialEntry(class {
      constructor(service, username) { return new (loadEntry(installed.cliBin))(service, username); }
    }, persist));
  } catch { /* Untrusted package/native exceptions never enter reports or the terminal. */ }
  finally {
    report.finishedAt = new Date().toISOString();
    if (persistenceFailed) { report.status = 'FAIL'; report.phase = 'report-persist'; }
    try { persist(); }
    finally { closeSync(fd); }
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--report') throw new Error();
    const report = runNativeCredentialProbe({ output: process.argv[3] });
    console.log(`Native credential probe: ${report.status} (${report.phase}).`);
    process.exitCode = report.status === 'PASS' ? 0 : report.status === 'BLOCKED' ? 3 : 1;
  } catch {
    console.error('Native credential probe rejected or report unavailable; no acceptance approval.');
    process.exitCode = 1;
  }
}
