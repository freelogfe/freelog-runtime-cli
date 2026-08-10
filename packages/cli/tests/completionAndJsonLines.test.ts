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
    expect(JSON.parse(line.trim())).toMatchObject({ event: 'ok', file: 'a.png' });
  });
});

describe('shell completion', () => {
  it('includes core commands in bash script', () => {
    const script = generateBashCompletion();
    expect(script).toContain('complete -F _freelog_cli freelog-cli');
    for (const cmd of ['validate', 'release', 'diff', 'completion']) {
      expect(script).toContain(cmd);
    }
  });

  it('includes commands in zsh script', () => {
    const script = generateZshCompletion();
    expect(script).toContain('compdef _freelog_cli freelog-cli');
    expect(CLI_TOP_COMMANDS).toContain('resource');
  });
});
