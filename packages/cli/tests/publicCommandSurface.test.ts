import { describe, expect, it } from 'vitest';
import { createSubCommands } from '../src/bin/subCommands.js';
import {
  cliReuseArgs,
  cliSessionStoreArgs,
  cliSyncWriteArgs,
  cliWriteCommandArgs,
} from '../src/core/cliArgs.js';

describe('public command surface', () => {
  it('hides internal parity commands unless FREELOG_DEV is enabled', () => {
    expect(createSubCommands(false)).toHaveProperty('start');
    expect(createSubCommands(false)).not.toHaveProperty('meta');
    expect(createSubCommands(false)).not.toHaveProperty('cover');
    expect(createSubCommands(true)).toHaveProperty('start');
    expect(createSubCommands(true)).toHaveProperty('meta');
    expect(createSubCommands(true)).toHaveProperty('cover');
  });

  it('gives dep sync commands Store session flags without reuse-only flags', () => {
    expect(cliSessionStoreArgs).toHaveProperty('session');
    expect(cliSessionStoreArgs).toHaveProperty('resource-id');
    expect(cliSessionStoreArgs).toHaveProperty('export-project');
    expect(cliSyncWriteArgs).toHaveProperty('session');
    expect(cliSyncWriteArgs).not.toHaveProperty('reuse-version');
    expect(cliReuseArgs).toHaveProperty('reuse-version');
    expect(cliWriteCommandArgs).toHaveProperty('reuse-version');
  });
});
