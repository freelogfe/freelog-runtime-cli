/** All dev harnesses use this resolver; an explicit candidate must never fall back to workspace dist. */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

export function resolveCliBin(repoRoot, env = process.env) {
  if (Object.hasOwn(env, 'FREELOG_TEST_CLI_BIN')) {
    const value = env.FREELOG_TEST_CLI_BIN;
    if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value)
      || !existsSync(value) || !statSync(value).isFile()) {
      throw new Error('FREELOG_TEST_CLI_BIN must identify the existing absolute candidate CLI entry; fallback is forbidden.');
    }
    return value;
  }
  if (env.FREELOG_TEST_CANDIDATE_MODE === '1') {
    throw new Error('Candidate mode requires FREELOG_TEST_CLI_BIN; workspace fallback is forbidden.');
  }
  return path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'index.js');
}

export function skipWorkspaceBuild(argv = process.argv, env = process.env) {
  return argv.includes('--skip-build') || env.FREELOG_TEST_CANDIDATE_MODE === '1' || Object.hasOwn(env, 'FREELOG_TEST_CLI_BIN');
}
