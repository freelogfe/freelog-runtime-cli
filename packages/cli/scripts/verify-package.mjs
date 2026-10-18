import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPackageFileAllowed, defaultRunner, verifyInstalledPackage } from '../../../scripts/release/core.mjs';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDir = path.resolve(packageDir, '../..');
const scratchDir = await mkdtemp(path.join(os.tmpdir(), 'freelog-cli-pack-'));

function run(command, args, cwd) {
  const result = defaultRunner(command, args, { cwd, timeoutMs: 300_000 });
  if (result.error || result.signal || result.status !== 0) throw new Error(`Package verification command did not complete successfully: ${command} ${args[0]}`);
  return result.stdout;
}

try {
  const sourcePackage = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
  const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', scratchDir], packageDir));
  if (!Array.isArray(packed) || packed.length !== 1 || packed[0].name !== sourcePackage.name || packed[0].version !== sourcePackage.version
    || typeof packed[0].filename !== 'string' || path.basename(packed[0].filename) !== packed[0].filename
    || !Array.isArray(packed[0].files) || packed[0].files.length === 0) throw new Error('Package manifest differs from approved source');
  for (const file of packed[0].files) assertPackageFileAllowed(file.path);
  const tarball = path.join(scratchDir, packed[0].filename);
  const installDir = path.join(scratchDir, 'install');
  await mkdir(installDir);
  run('npm', ['install', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund', '--registry', 'https://registry.npmjs.org/', '--prefix', installDir, tarball], scratchDir);
  verifyInstalledPackage(repositoryDir, installDir, sourcePackage.version, defaultRunner);
  process.stdout.write(`package smoke passed: @freelog-cli/cli2@${sourcePackage.version}; all usage documents byte-identical\n`);
} finally {
  await rm(scratchDir, { recursive: true, force: true });
}
