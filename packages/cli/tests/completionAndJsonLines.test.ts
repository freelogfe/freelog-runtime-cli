import { describe, expect, it } from 'vitest';
import { formatBatchProgressLine } from '../src/services/batch/progress.js';
import {
  CLI_TOP_COMMANDS,
  generateBashCompletion,
  generateZshCompletion,
} from '../src/core/cliCatalog.js';

describe('batch progress json-lines', () => {
  it('formats NDJSON line', () => {
    const line = formatBatchProgressLine({
      event: 'ok',
      index: 0,
      file: 'a.png',
      resourceId: 'id1',
      resourceName: 'user/a',
      subdir: 'a',
    });
    expect(line.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(line.trim());
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      command: 'resource import-dir',
      event: 'ok',
      data: { file: 'a.png' },
    });
  });
});

describe('shell completion', () => {
  it('includes collection version/properties in bash script', () => {
    const script = generateBashCompletion();
    expect(script).toContain('version properties');
    expect(script).toContain('complete -F _freelog_cli freelog-cli');
  });

  it('includes commands in zsh script', () => {
    const script = generateZshCompletion();
    expect(script).toContain('compdef _freelog_cli freelog-cli');
    expect(CLI_TOP_COMMANDS).toContain('resource');
  });
});
