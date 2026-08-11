import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

const activeDocuments = [
  'docs/README.md',
  'docs/新方案/README.md',
  'docs/新方案/开发/CLI字段账本.md',
  'docs/新方案/开发/CLI脚手架设计.md',
  'docs/新方案/对齐/README.md',
  'docs/新方案/对齐/CLI数据操作与Console对照.md',
  'docs/新方案/对齐/CLI拓扑与Console对照.md',
  'docs/新方案/对齐/Console完整业务梳理.md',
  'docs/新方案/对齐/Console表单字段与交互规则.md',
  'docs/新方案/使用/CLI使用说明与Console差异.md',
  'docs/新方案/使用/普通用户简明手册.md',
  'docs/新方案/验证/手动测试.md',
];

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('documentation governance', () => {
  it('keeps one explicit product source of truth', () => {
    const design = read('DESIGN.md');
    const index = read('docs/新方案/README.md');

    expect(design).toContain('唯一产品设计契约');
    expect(index).toContain('唯一产品设计入口');
    expect(index).toContain('[DESIGN.md](../../DESIGN.md)');
  });

  it('labels active downstream documents with a non-product role', () => {
    const missingRole = activeDocuments.slice(2).filter(
      (document) => !read(document).split(/\r?\n/).slice(0, 10).join('\n').includes('文档角色'),
    );
    expect(missingRole).toEqual([]);
  });

  it('keeps the active documentation tree free of archives, handoff snapshots, and duplicate manuals', () => {
    const markdownFiles: string[] = [];
    const visit = (relativePath: string) => {
      for (const entry of fs.readdirSync(path.join(repoRoot, relativePath), { withFileTypes: true })) {
        const child = path.join(relativePath, entry.name);
        if (entry.isDirectory()) visit(child);
        else if (entry.name.endsWith('.md')) markdownFiles.push(child.replaceAll('\\', '/'));
      }
    };
    visit('docs');

    const allowed = new Set([
      ...activeDocuments,
      'docs/新方案/验证/reports/2026-08-11-dev.md',
    ].map((file) => file.replaceAll('\\', '/')));
    expect(markdownFiles.filter((file) => !allowed.has(file)).sort()).toEqual([]);
  });

  it('keeps relative Markdown links inside the active documentation tree resolvable', () => {
    const broken: string[] = [];
    for (const document of ['README.md', 'DESIGN.md', 'packages/cli/README.md', ...activeDocuments]) {
      const source = read(document);
      for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
        const href = match[1]!.trim().replace(/^<|>$/g, '');
        if (!href || href.startsWith('#') || /^[a-z]+:/i.test(href)) continue;
        const target = decodeURI(href.split('#')[0]!);
        const resolved = path.resolve(repoRoot, path.dirname(document), target);
        if (!fs.existsSync(resolved)) broken.push(`${document} -> ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('keeps platform-bound projects, credentials, and generated E2E workspaces out of the repo', () => {
    const forbidden: string[] = [];
    const visit = (absolutePath: string) => {
      for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
        if (['.git', 'node_modules', 'dist'].includes(entry.name)) continue;
        const child = path.join(absolutePath, entry.name);
        if (entry.name === '.freelog' || entry.name.startsWith('.freelog-auth')) {
          forbidden.push(path.relative(repoRoot, child));
          continue;
        }
        if (entry.isDirectory()) visit(child);
        else if (entry.name === 'freelog.manifest.json') forbidden.push(path.relative(repoRoot, child));
      }
    };
    visit(repoRoot);

    const unexpectedTestEntries = fs
      .readdirSync(path.join(repoRoot, 'test'))
      .filter((entry) => !['README.md', 'fixtures', 'run-all-scenarios.mjs'].includes(entry));
    expect(forbidden).toEqual([]);
    expect(unexpectedTestEntries).toEqual([]);
  });

  it('keeps a field-level Console contract for every core form surface', () => {
    const contract = read('docs/新方案/对齐/Console表单字段与交互规则.md');
    const requiredIds = [
      'FORM-RES-TYPE',
      'FORM-RES-TITLE',
      'FORM-RES-NAME',
      'FORM-VER-FILE',
      'FORM-VER-NUMBER',
      'FORM-VER-DEPS',
      'FORM-LIST-COVER',
      'FORM-LIST-INTRO',
      'FORM-LIST-TAGS',
      'FORM-POL-NAME',
      'FORM-ONLINE',
      'FORM-COL-ADD',
      'FORM-COL-DISPLAY',
      'FORM-COL-MERGE',
      'FORM-BATCH-COUNT',
      'FORM-BATCH-NAME',
    ];

    expect(requiredIds.filter((id) => !contract.includes(`\`${id}\``))).toEqual([]);
    expect(contract).toContain('最多 200 字');
    expect(contract).toContain('最多 20 个');
    expect(contract).toContain('单标签最多 20 字');
    expect(contract).toContain('部分 C 证据');
    expect(contract).toContain('待专项 ENV');
  });

  it('does not preserve the obsolete 1000-character introduction contract in active docs', () => {
    const contractDocuments = [
      'DESIGN.md',
      'docs/新方案/README.md',
      'docs/新方案/开发/CLI字段账本.md',
      'docs/新方案/对齐/Console完整业务梳理.md',
      'docs/新方案/对齐/Console表单字段与交互规则.md',
    ];

    expect(contractDocuments.filter((document) => /简介.{0,12}1000/.test(read(document)))).toEqual(
      [],
    );
  });

  it('classifies released-version videoCover as a CLI enhancement, not Console parity', () => {
    const topology = read('docs/新方案/对齐/CLI拓扑与Console对照.md');
    const contract = read('docs/新方案/对齐/Console表单字段与交互规则.md');

    expect(topology).toContain('Console 当前维护页无入口');
    expect(topology).toContain('CLI 增强，非 Console parity');
    expect(contract).toContain('CLI 允许新版本显式设置，是 CLI 增强');
  });

  it('does not keep known verification passwords in active docs or scripts', () => {
    const roots = ['docs/新方案', 'packages/cli/scripts'];
    const files: string[] = [];
    const visit = (relativePath: string) => {
      const absolutePath = path.join(repoRoot, relativePath);
      for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
        const child = path.join(relativePath, entry.name);
        if (entry.isDirectory()) {
          visit(child);
        } else if (/\.(?:md|mjs)$/.test(entry.name)) {
          files.push(child);
        }
      }
    };
    roots.forEach(visit);

    const forbiddenValues = ['freelog-test' + '1111', 'snnaenu' + '1'];
    const leaked = files.filter((file) =>
      forbiddenValues.some((forbiddenValue) => read(file).includes(forbiddenValue)),
    );
    expect(leaked).toEqual([]);
  });
});
