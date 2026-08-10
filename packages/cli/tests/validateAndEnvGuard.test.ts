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
});
