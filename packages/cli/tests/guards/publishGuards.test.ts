import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/core/errors.js';
import {
  assertPublishNotCollectionCwd,
  assertPublishVersionReady,
  assertVersionGreaterThanLatest,
} from '../../src/services/shared/guards/index.js';
import { buildCreateVersionInputAttrs } from '../../src/services/resource/index.js';

describe('publishGuards', () => {
  it('requires version > latest', () => {
    expect(() => assertVersionGreaterThanLatest('1.0.0', '1.0.0')).toThrow(CliError);
    expect(() => assertVersionGreaterThanLatest('0.9.0', '1.0.0')).toThrow(CliError);
    expect(() => assertVersionGreaterThanLatest('1.0.1', '1.0.0')).not.toThrow();
  });

  it('requires version and filePath before publish', () => {
    expect(() => assertPublishVersionReady({})).toThrow(CliError);
    expect(() => assertPublishVersionReady({ version: '1.0.0' })).toThrow(CliError);
    expect(() => assertPublishVersionReady({ version: '1.0.0', filePath: 'dist' })).not.toThrow();
  });

  it('rejects collection cwd for single publish', () => {
    expect(() => assertPublishNotCollectionCwd('/nonexistent/path')).not.toThrow();
  });
});

describe('createVersionParams helpers', () => {
  it('builds runtimeVersion input attr', () => {
    const attrs = buildCreateVersionInputAttrs({ runtimeVersion: '0.5' });
    expect(attrs).toEqual([{ key: 'runtimeVersion', value: '0.5' }]);
  });
});
