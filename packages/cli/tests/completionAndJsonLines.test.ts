import { describe, expect, it } from 'vitest';
import { formatBatchProgressLine } from '../src/services/batch/progress.js';
import {
  CLI_COLLECTION_ITEM_SUBCOMMANDS,
  CLI_DRAFT_SUBCOMMANDS,
  CLI_INIT_PRESETS,
  CLI_TOP_COMMANDS,
  CLI_TYPE_SUBCOMMANDS,
  generateBashCompletion,
  generateZshCompletion,
} from '../src/core/cliCatalog.js';
import { unwrapCliJson } from '../src/core/jsonEnvelope.js';

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

  it('includes depth-2/3 subcommands in bash script', () => {
    const script = generateBashCompletion();
    for (const sub of CLI_TYPE_SUBCOMMANDS) {
      expect(script).toContain(sub);
    }
    for (const sub of CLI_DRAFT_SUBCOMMANDS) {
      expect(script).toContain(sub);
    }
    for (const preset of CLI_INIT_PRESETS) {
      expect(script).toContain(preset);
    }
    for (const sub of CLI_COLLECTION_ITEM_SUBCOMMANDS) {
      expect(script).toContain(sub);
    }
    expect(script).toContain('COMP_WORDS[2]}" == "item"');
    expect(script).toContain('COMP_WORDS[2]}" == "rss"');
  });

  it('includes commands in zsh script', () => {
    const script = generateZshCompletion();
    expect(script).toContain('compdef _freelog_cli freelog-cli');
    expect(CLI_TOP_COMMANDS).toContain('resource');
    expect(script).toContain('item) _values');
    expect(script).toContain('rss) _values');
  });
});

describe('json envelope unwrap', () => {
  it('flattens error.details for script backward compat', () => {
    const parsed = unwrapCliJson({
      schemaVersion: 1,
      ok: false,
      command: 'publish',
      error: {
        code: 5,
        message: 'deps unresolved',
        details: { unresolvedDependencies: ['a'], gates: [{ id: 'g1' }] },
      },
      warnings: [],
      meta: { env: 'dev' },
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe(5);
    expect(parsed.unresolvedDependencies).toEqual(['a']);
    expect(parsed.gates).toEqual([{ id: 'g1' }]);
  });

  it('uses subcommand-specific command field in success envelope', () => {
    const parsed = unwrapCliJson({
      schemaVersion: 1,
      ok: true,
      command: 'dep list',
      data: { dependencies: [], tree: null },
      warnings: [],
      meta: { env: 'dev' },
    });
    expect(parsed.command).toBe('dep list');
    expect(parsed.dependencies).toEqual([]);
  });
});
