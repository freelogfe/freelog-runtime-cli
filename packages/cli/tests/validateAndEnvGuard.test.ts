import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CliError } from '../src/core/errors.js';

describe('assertExplicitEnvForWriteOperation', () => {
  let assertExplicitEnvForWriteOperation: () => void;
  const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');

  beforeEach(async () => {
    const mod = await import('../src/core/command.js');
    assertExplicitEnvForWriteOperation = mod.assertExplicitEnvForWriteOperation;
    const { setCliEnv } = await import('../src/core/env.js');
    setCliEnv('production');
    process.env.FREELOG_ENV = '';
  });

  afterEach(() => {
    if (stdinDescriptor) {
      Object.defineProperty(process.stdin, 'isTTY', stdinDescriptor);
    }
    delete process.env.FREELOG_ENV;
  });

  it('allows TTY without explicit env', () => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    expect(() => assertExplicitEnvForWriteOperation()).not.toThrow();
  });

  it('blocks non-TTY default production', async () => {
    vi.stubEnv('VITEST', '');
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });
    const { setCliEnv } = await import('../src/core/env.js');
    setCliEnv('production');
    expect(() => assertExplicitEnvForWriteOperation()).toThrow(CliError);
    vi.unstubAllEnvs();
  });

  it('allows non-TTY when env is dev', async () => {
    vi.stubEnv('VITEST', '');
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });
    const { setCliEnv } = await import('../src/core/env.js');
    setCliEnv('dev');
    expect(() => assertExplicitEnvForWriteOperation()).not.toThrow();
    vi.unstubAllEnvs();
  });
});

describe('validateProject (offline)', () => {
  it('errors when manifest missing', async () => {
    const { validateProject } = await import('../src/services/validateService.js');
    const result = await validateProject({
      cwd: '/nonexistent-freelog-project-xyz',
      target: 'project',
    });
    expect(result.ok).toBe(false);
    expect(result.checks.some((c) => c.id === 'manifest' && c.level === 'error')).toBe(true);
  });

  it('reports Console field-contract violations from manifest before platform writes', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-validate-fields-'));
    fs.writeFileSync(
      path.join(cwd, 'freelog.manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        subject: 'resource',
        identity: { name: 'field-contract' },
        resource: {
          typeCode: 'RT-TEST',
          title: 'Valid',
          intro: 'x'.repeat(201),
          tags: ['valid'],
        },
        version: null,
        collection: null,
      }),
    );

    const { validateProject } = await import('../src/services/validateService.js');
    const result = await validateProject({ cwd, target: 'project' });
    expect(result.checks).toContainEqual(
      expect.objectContaining({ id: 'listing-intro', level: 'error' }),
    );
  });

  it('can validate pre-build intent without requiring the not-yet-generated artifact', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-validate-prebuild-'));
    fs.writeFileSync(
      path.join(cwd, 'freelog.manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        subject: 'resource',
        identity: { name: 'prebuild' },
        resource: { typeCode: 'RT-TEST', title: 'Prebuild' },
        version: {
          version: '1.0.0',
          filePath: 'dist',
          artifactMode: 'directory-zip',
        },
        collection: null,
      }),
    );

    const { validateProject } = await import('../src/services/validateService.js');
    const result = await validateProject({
      cwd,
      target: 'publish',
      skipArtifactChecks: true,
    });
    expect(result.checks.some((check) => check.id === 'file-exists')).toBe(false);
  });
});
