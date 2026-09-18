import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratchDir = await mkdtemp(path.join(os.tmpdir(), 'freelog-cli-pack-'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
}

try {
  const packed = JSON.parse(run(npmCommand, ['pack', '--json', '--pack-destination', scratchDir], packageDir));
  const tarball = path.join(scratchDir, packed[0].filename);
  const installDir = path.join(scratchDir, 'install');
  await mkdir(installDir);
  run(npmCommand, ['install', '--ignore-scripts', '--no-package-lock', '--prefix', installDir, tarball], scratchDir);
  const installed = path.join(installDir, 'node_modules', '@freelog-cli', 'cli2');
  const packageJson = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));
  const bin = path.join(installed, 'dist', 'bin', 'index.js');
  const version = run('node', [bin, '--cli-version'], installDir).trim();
  const help = run('node', [bin, '--help'], installDir);
  if (version !== packageJson.version) {
    throw new Error(`发布版 --cli-version 不匹配：${version} !== ${packageJson.version}`);
  }
  if (!help.includes(path.join(installed, 'dist', 'docs', 'README.md'))) {
    throw new Error('发布版 --help 没有指向包内使用文档');
  }
  process.stdout.write(`package smoke passed: @freelog-cli/cli2@${packageJson.version}\n`);
} finally {
  await rm(scratchDir, { recursive: true, force: true });
}
