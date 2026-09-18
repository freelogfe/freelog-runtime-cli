import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PATTERNS = [
  '.freelog/',
  '.freelog-auth',
  '.git/',
  '.hg/',
  '.svn/',
  'node_modules/',
  '.cache/',
  '.turbo/',
  '.vite/',
  'coverage/',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '*.tmp',
  '~$*',
  '.freelogignore',
  'freelog.*.config',
  'freelog.batch.json',
  'freelog.batch.yaml',
  'freelog.batch.yml',
];

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
}

function globToRegExp(pattern: string): RegExp {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        if (pattern[index + 2] === '/') {
          source += '(?:.*/)?';
          index += 2;
        } else {
          source += '.*';
          index += 1;
        }
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`, 'i');
}

function matchesPattern(relativePath: string, pattern: string, isDirectory: boolean): boolean {
  const normalizedPath = normalizeRelativePath(relativePath);
  const directoryPattern = pattern.endsWith('/');
  const normalizedPattern = normalizeRelativePath(pattern);
  if (!normalizedPattern) return false;

  const pathCandidates = normalizedPattern.includes('/')
    ? [normalizedPath]
    : normalizedPath.split('/');
  const matcher = globToRegExp(normalizedPattern);
  if (directoryPattern) {
    const segments = normalizedPath.split('/');
    if (!normalizedPattern.includes('/')) {
      return segments.some((segment) => matcher.test(segment));
    }
    return segments.some((_, index) => matcher.test(segments.slice(0, index + 1).join('/'))) ||
      (isDirectory && pathCandidates.some((candidate) => matcher.test(candidate)));
  }
  return pathCandidates.some((candidate) => matcher.test(candidate));
}

export function parseFreelogIgnoreContent(content: string): string[] {
  const patterns = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const unsupported = patterns.find((pattern) => pattern.startsWith('!'));
  if (unsupported) {
    throw new Error(`.freelogignore v1 不支持反选规则: ${unsupported}`);
  }
  return patterns;
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
  return isIgnoredPath(name, false, patterns);
}

export function isIgnoredPath(
  relativePath: string,
  isDirectory: boolean,
  patterns: string[],
): boolean {
  return patterns.some((pattern) => matchesPattern(relativePath, pattern, isDirectory));
}

export function filterIgnoredFiles(files: string[], patterns: string[]): string[] {
  return files.filter((file) => !isIgnoredFilename(file, patterns));
}

export const DEFAULT_FREELOGIGNORE = `# freelog ignore — 批量扫描与目录压缩共用（项目根相对 glob）
.DS_Store
Thumbs.db
desktop.ini
*.tmp
~$*
`;
