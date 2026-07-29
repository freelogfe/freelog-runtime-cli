import fs from 'node:fs';
import path from 'node:path';

export type ConfigKind = 'resource' | 'version' | 'collection';

const NAMES: Record<ConfigKind, string[]> = {
  resource: [
    'freelog.resource.config.ts',
    'freelog.resource.config.js',
    'freelog.resource.config.cjs',
  ],
  version: [
    'freelog.version.config.ts',
    'freelog.version.config.js',
    'freelog.version.config.cjs',
  ],
  collection: [
    'freelog.collection.config.ts',
    'freelog.collection.config.js',
    'freelog.collection.config.cjs',
  ],
};

export function resolveCwd(cwd?: string): string {
  return path.resolve(cwd || process.cwd());
}

export function findConfigPath(kind: ConfigKind, cwd?: string): string | null {
  const root = resolveCwd(cwd);
  for (const name of NAMES[kind]) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
