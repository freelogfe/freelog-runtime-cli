import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  filterIgnoredFiles,
  isIgnoredFilename,
  loadFreelogIgnorePatterns,
  parseFreelogIgnoreContent,
} from '../src/services/freelogIgnore.js';
import {
  findProjectConfig,
  loadProjectDefaultEnv,
  writeProjectConfig,
} from '../src/core/projectConfig.js';
import { scanWorkspaceProjects } from '../src/services/workspaceScan.js';
import {
  resolvePolicyInitTarget,
  writeAuthMapInitFile,
  writePolicyInitFile,
} from '../src/services/scaffoldInit.js';
import { applyGlobalFlags, getCliEnv } from '../src/core/env.js';

describe('freelogIgnore', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  function mkDir(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-ignore-'));
    dirs.push(d);
    return d;
  }

  it('parses ignore lines and skips comments', () => {
    expect(parseFreelogIgnoreContent('# comment\n*.bak\n')).toEqual(['*.bak']);
  });

  it('filters default junk files', () => {
    const dir = mkDir();
    const patterns = loadFreelogIgnorePatterns(dir);
    expect(isIgnoredFilename('.DS_Store', patterns)).toBe(true);
    expect(isIgnoredFilename('clip.mp4', patterns)).toBe(false);
  });

  it('loads .freelogignore patterns', () => {
    const dir = mkDir();
    fs.writeFileSync(path.join(dir, '.freelogignore'), 'draft.*\n', 'utf8');
    const patterns = loadFreelogIgnorePatterns(dir);
    expect(filterIgnoredFiles(['a.mp4', 'draft.txt'], patterns)).toEqual(['a.mp4']);
  });

  it('simulates import-dir flat file list after ignore', () => {
    const dir = mkDir();
    fs.writeFileSync(path.join(dir, 'keep.jpg'), 'x');
    fs.writeFileSync(path.join(dir, 'skip.tmp'), 'y');
    fs.writeFileSync(path.join(dir, '.freelogignore'), '*.tmp\n');
    const files = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && !/^freelog\..*\.config/i.test(e.name))
      .map((e) => path.join(dir, e.name));
    const patterns = loadFreelogIgnorePatterns(dir);
    expect(filterIgnoredFiles(files, patterns).map((f) => path.basename(f))).toEqual(['keep.jpg']);
  });
});

describe('projectConfig', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  function mkDir(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-cfg-'));
    dirs.push(d);
    return d;
  }

  it('finds config upward and loads defaultEnv', () => {
    const root = mkDir();
    const sub = path.join(root, 'pkg', 'app');
    fs.mkdirSync(sub, { recursive: true });
    writeProjectConfig(root, { defaultEnv: 'dev' });
    const found = findProjectConfig(sub);
    expect(found?.config.defaultEnv).toBe('dev');
    expect(loadProjectDefaultEnv(sub)).toBe('dev');
  });

  it('applyGlobalFlags picks project default env', () => {
    const root = mkDir();
    writeProjectConfig(root, { defaultEnv: 'test' });
    const prev = process.cwd();
    process.chdir(root);
    try {
      applyGlobalFlags({});
      expect(getCliEnv()).toBe('test');
    } finally {
      process.chdir(prev);
    }
  });
});

describe('workspaceScan', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('finds nested manifests', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-ws-'));
    dirs.push(root);
    const a = path.join(root, 'apps', 'alpha');
    fs.mkdirSync(a, { recursive: true });
    fs.writeFileSync(
      path.join(a, 'freelog.manifest.json'),
      JSON.stringify({ subject: 'resource', identity: { name: 'alpha' } }),
      'utf8',
    );
    const hits = scanWorkspaceProjects(root, 3);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.name).toBe('alpha');
  });
});

describe('scaffoldInit', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('writes policy and auth-map templates', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-scaffold-'));
    dirs.push(dir);
    const policy = writePolicyInitFile(dir);
    const auth = writeAuthMapInitFile(dir);
    expect(policy.skipped).toBe(false);
    expect(auth.skipped).toBe(false);
    expect(JSON.parse(fs.readFileSync(policy.path, 'utf8')).policyName).toBe('免费');
    expect(fs.readFileSync(auth.path, 'utf8')).toMatch(/auth-map\.yaml/);
  });

  it('collection policy init uses FOR PUBLIC syntax', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-scaffold-coll-'));
    dirs.push(dir);
    const { payload } = resolvePolicyInitTarget(dir, true);
    expect(payload.policyText.toUpperCase()).toContain('FOR PUBLIC');
  });
});

describe('readLatestGitCommitMessage', () => {
  it('returns null outside git repo', async () => {
    const { readLatestGitCommitMessage } = await import('../src/services/gitChangelog.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-nogit-'));
    expect(readLatestGitCommitMessage(dir)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
