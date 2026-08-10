import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

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
    const documents = [
      'docs/新方案/开发/CLI字段账本.md',
      'docs/新方案/开发/CLI脚手架设计.md',
      'docs/新方案/对齐/CLI数据操作与Console对照.md',
      'docs/新方案/对齐/Console完整业务梳理.md',
      'docs/新方案/使用/CLI使用说明与Console差异.md',
      'docs/新方案/使用/普通用户简明手册.md',
      'docs/新方案/使用/测试人员简明手册.md',
      'docs/新方案/场景/01-生命周期与拓扑.md',
      'docs/新方案/场景/02-主路径.md',
      'docs/新方案/场景/03-命令节点.md',
      'docs/新方案/场景/04-问题矩阵.md',
      'docs/新方案/场景/05-场景实例.md',
      'docs/新方案/场景/06-Console对照与测试.md',
      'docs/新方案/场景/07-用户身份测试手册.md',
      'docs/新方案/场景/08-测试人员手册.md',
    ];

    const missingRole = documents.filter(
      (document) => !read(document).split(/\r?\n/).slice(0, 10).join('\n').includes('文档角色'),
    );
    expect(missingRole).toEqual([]);
  });

  it('does not keep known verification passwords in active docs or scripts', () => {
    const roots = ['docs/新方案', 'packages/cli/scripts'];
    const files: string[] = [];
    const visit = (relativePath: string) => {
      const absolutePath = path.join(repoRoot, relativePath);
      for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
        const child = path.join(relativePath, entry.name);
        if (entry.isDirectory()) {
          if (child.replaceAll('\\', '/') === 'docs/新方案/archive') continue;
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
