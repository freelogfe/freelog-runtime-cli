import { describe, expect, it } from 'vitest';
import { normalizeProjectPath } from '../../src/local/projectPath';

describe('唯一产物路径', () => {
  it('产物路径必须留在工程内', () => {
    expect(normalizeProjectPath('/project', './dist')).toBe('dist');
    expect(() => normalizeProjectPath('/project', '../dist')).toThrow();
    expect(() => normalizeProjectPath('/project', '/outside/dist')).toThrow();
    expect(() => normalizeProjectPath('/project', '.freelog/1.json')).toThrow();
  });
});
