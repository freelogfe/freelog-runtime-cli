import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../core/atomicWrite';
import { CliError } from '../core/errors';
import { freelogDir, listIdentities } from './identity';
import type { IdentityIndex, IdentityRecord } from './types';

export function indexFilePath(cwd: string): string {
  return path.join(freelogDir(cwd), 'index.json');
}

export function normalizeFileKey(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function readIndex(cwd: string): IdentityIndex {
  const filePath = indexFilePath(cwd);
  if (!existsSync(filePath)) {
    return {};
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    // i18n: cli.local.index_unreadable
    throw new CliError('index.json 无法解析', 'INDEX_INVALID');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    // i18n: cli.local.index_invalid
    throw new CliError('index.json 无效', 'INDEX_INVALID');
  }
  const index: IdentityIndex = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Number.isInteger(value) || (value as number) < 1) {
      // i18n: cli.local.index_invalid
      throw new CliError('index.json 无效', 'INDEX_INVALID');
    }
    index[normalizeFileKey(key)] = value as number;
  }
  return index;
}

export function writeIndex(cwd: string, index: IdentityIndex): void {
  const normalized: IdentityIndex = {};
  for (const [key, value] of Object.entries(index)) {
    normalized[normalizeFileKey(key)] = value;
  }
  atomicWriteFile(
    indexFilePath(cwd),
    `${JSON.stringify(normalized, null, 2)}\n`,
  );
}

export function indexFromIdentities(identities: readonly IdentityRecord[]): IdentityIndex {
  const index: IdentityIndex = {};
  for (const identity of identities) {
    if (identity.filePath) {
      index[normalizeFileKey(identity.filePath)] = identity.n;
    }
  }
  return index;
}

function sameIndex(left: IdentityIndex, right: IdentityIndex): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
}

/** 和 `N.json` 打架时听 `N.json`，并写回 index。 */
export function repairIndex(cwd: string): IdentityIndex {
  const expected = indexFromIdentities(listIdentities(cwd));
  const current = existsSync(indexFilePath(cwd)) ? readIndex(cwd) : {};
  if (!sameIndex(current, expected)) {
    writeIndex(cwd, expected);
  }
  return expected;
}
