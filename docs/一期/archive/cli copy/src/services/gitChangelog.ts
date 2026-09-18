import { execSync } from 'node:child_process';

/** 取最近一次 git commit 正文，用作 publish description */
export function readLatestGitCommitMessage(cwd: string): string | null {
  try {
    const msg = execSync('git log -1 --pretty=%B', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return msg || null;
  } catch {
    return null;
  }
}
