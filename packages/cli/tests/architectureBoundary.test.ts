import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(import.meta.dirname, '../src');

function listTypeScriptFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(target);
    return entry.name.endsWith('.ts') ? [target] : [];
  });
}

function relativeImports(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  return Array.from(source.matchAll(/(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g))
    .map((match) => match[1])
    .filter((specifier): specifier is string => Boolean(specifier?.startsWith('.')))
    .map((specifier) => path.resolve(path.dirname(file), specifier));
}

function topLevelArea(file: string): string {
  return path.relative(sourceRoot, file).split(path.sep)[0] || '';
}

describe('source architecture boundaries', () => {
  const files = listTypeScriptFiles(sourceRoot);

  it('keeps lower layers independent from commands and services', () => {
    const forbidden: Record<string, Set<string>> = {
      core: new Set(['bin', 'commands', 'services', 'platform', 'config', 'adapters']),
      config: new Set(['bin', 'commands', 'services', 'platform', 'adapters']),
      platform: new Set(['bin', 'commands', 'services', 'config', 'adapters']),
      adapters: new Set(['bin', 'commands', 'services', 'platform', 'core']),
    };
    const violations: string[] = [];

    for (const file of files) {
      const sourceArea = topLevelArea(file);
      const blocked = forbidden[sourceArea];
      if (!blocked) continue;
      for (const target of relativeImports(file)) {
        const targetArea = topLevelArea(target);
        if (blocked.has(targetArea)) {
          violations.push(`${path.relative(sourceRoot, file)} -> ${path.relative(sourceRoot, target)}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('prevents services from importing command or bin layers', () => {
    const violations = files
      .filter((file) => topLevelArea(file) === 'services')
      .flatMap((file) =>
        relativeImports(file)
          .filter((target) => ['commands', 'bin'].includes(topLevelArea(target)))
          .map((target) => `${path.relative(sourceRoot, file)} -> ${path.relative(sourceRoot, target)}`),
      );

    expect(violations).toEqual([]);
  });

  it('allows only login to access platform directly from commands', () => {
    const violations = files
      .filter((file) => topLevelArea(file) === 'commands')
      .flatMap((file) =>
        relativeImports(file)
          .filter((target) => topLevelArea(target) === 'platform')
          .filter(() => path.relative(sourceRoot, file).replaceAll('\\', '/') !== 'commands/login.ts')
          .map((target) => `${path.relative(sourceRoot, file)} -> ${path.relative(sourceRoot, target)}`),
      );

    expect(violations).toEqual([]);
  });
});
