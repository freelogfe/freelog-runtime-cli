#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';

const cliRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(cliRoot, '../..');
const compat = JSON.parse(
  fs.readFileSync(path.join(cliRoot, 'compat', 'template-compat.json'), 'utf8').replace(/^\uFEFF/, ''),
);

function runNpm(args, cwd = cliRoot) {
  const result = spawnSync('npm', args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `npm ${args.join(' ')} failed with ${result.status}`);
  }
  return result.stdout;
}

const refs = Object.entries(compat.runtimes || {}).flatMap(([runtime, block]) =>
  Object.entries(block.templates || {}).map(([id, ref]) => ({ id, runtime, ...ref })),
);

const failures = [];
for (const ref of refs) {
  if (ref.version !== 'latest') {
    failures.push(`${ref.id}: runtime 模板必须使用 latest selector`);
    continue;
  }

  const localManifestPath = path.join(
    repoRoot,
    'packages',
    'templates',
    ref.id,
    'template.manifest.json',
  );
  const localManifest = JSON.parse(fs.readFileSync(localManifestPath, 'utf8').replace(/^\uFEFF/, ''));
  const latest = JSON.parse(runNpm(['view', `${ref.npmName}@latest`, 'version', '--json']));
  if (!semver.valid(latest) || semver.lt(latest, localManifest.version)) {
    failures.push(`${ref.id}: npm latest=${latest} 早于本地 ${localManifest.version}`);
    continue;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `freelog-template-${ref.id}-`));
  try {
    const packed = JSON.parse(
      runNpm(['pack', `${ref.npmName}@${latest}`, '--pack-destination', tempRoot, '--json'], tempRoot),
    );
    const filename = packed?.[0]?.filename;
    if (!filename) throw new Error(`${ref.id}: npm pack 未返回 filename`);
    const tarball = path.isAbsolute(filename) ? filename : path.join(tempRoot, filename);
    const extract = spawnSync('tar', ['-xzf', tarball, '-C', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (extract.status !== 0) throw new Error(extract.stderr.trim() || `${ref.id}: tar 解压失败`);

    const manifestPath = path.join(tempRoot, 'package', 'template.manifest.json');
    const templatePath = path.join(tempRoot, 'package', 'template');
    if (!fs.existsSync(manifestPath) || !fs.existsSync(templatePath)) {
      failures.push(`${ref.id}@${latest}: tarball 缺少 template.manifest.json 或 template/`);
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
    if (
      manifest.id !== ref.id ||
      manifest.npmName !== ref.npmName ||
      manifest.version !== latest ||
      !manifest.runtimeVersions?.includes(ref.runtime) ||
      manifest.freelogRuntimeRange !== blockRuntimeRange(ref.runtime)
    ) {
      failures.push(`${ref.id}@${latest}: manifest 与 runtime 兼容矩阵不一致`);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function blockRuntimeRange(runtime) {
  return compat.runtimes[runtime]?.freelogRuntimeRange;
}

if (failures.length) {
  console.error(`verify:template-registry failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`verify:template-registry passed (${refs.length} runtime templates)`);
