import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PATTERNS = [
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '*.tmp',
  '~$*',
  '.freelogignore',
  'freelog.batch.json',
  'freelog.batch.yaml',
  'freelog.batch.yml',
];

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

export function parseFreelogIgnoreContent(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

export function loadFreelogIgnorePatterns(dir: string): string[] {
  const resolved = path.resolve(dir);
  const patterns = [...DEFAULT_PATTERNS];
  const candidates = [
    path.join(resolved, '.freelogignore'),
    path.join(resolved, '.freelog', 'ignore'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    patterns.push(...parseFreelogIgnoreContent(fs.readFileSync(file, 'utf8')));
  }
  return [...new Set(patterns)];
}

export function isIgnoredFilename(name: string, patterns: string[]): boolean {
  const base = path.basename(name);
  return patterns.some((pattern) => patternToRegExp(pattern).test(base));
}

export function filterIgnoredFiles(files: string[], patterns: string[]): string[] {
  return files.filter((file) => !isIgnoredFilename(file, patterns));
}

export const DEFAULT_FREELOGIGNORE = `# freelog ignore — 批量 import-dir 跳过匹配文件（glob 风格）
.DS_Store
Thumbs.db
desktop.ini
*.tmp
~$*
`;
