import { describe, expect, it } from 'vitest';
import { packageVersion } from '../../src/core/packageVersion';

describe('packageVersion', () => {
  it('读取当前 CLI 包的版本，而不是写死的命令常量', () => {
    const packageJson = JSON.parse(readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json'),
      'utf8',
    )) as { version: string };
    expect(packageVersion()).toBe(packageJson.version);
  });
});
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
