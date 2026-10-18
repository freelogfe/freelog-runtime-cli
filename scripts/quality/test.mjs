/** 不依赖 shell glob 或 Node 新版目录展开；空测试清单必须非零。 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function testArguments(files) {
  if (!Array.isArray(files) || files.length === 0 || new Set(files).size !== files.length
    || files.some((file) => typeof file !== 'string' || !path.isAbsolute(file) || !file.endsWith('.test.mjs'))) {
    throw new Error('质量工具测试清单为空、重复或无效；禁止空测试通过');
  }
  return ['--test', '--test-concurrency=1', ...[...files].sort()];
}

/** Real temporary-Git regressions are serial; the budget fits inside CI's twenty-minute job. */
export function runTests(files, spawn = spawnSync) {
  const result = spawn(process.execPath, testArguments(files), { stdio: 'inherit', timeout: 600_000 });
  if (result.error?.code === 'ETIMEDOUT') throw new Error('QUALITY_TEST_TIMEOUT: ten-minute execution budget exceeded; no test approval was produced');
  if (result.error || result.signal || !Number.isInteger(result.status)) throw new Error('QUALITY_TEST_INCOMPLETE: spawn, signal or missing exit status');
  if (result.status !== 0) throw new Error(`QUALITY_TEST_FAILED: exit ${result.status}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test/quality');
    const files = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs')).map((entry) => path.join(directory, entry.name));
    runTests(files);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
