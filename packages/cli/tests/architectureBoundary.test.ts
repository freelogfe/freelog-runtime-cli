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

  it('keeps a maintainer guide and contract comments for stateful boundaries', () => {
    const guide = fs.readFileSync(path.join(sourceRoot, 'ARCHITECTURE.md'), 'utf8');
    for (const heading of [
      '## 运行时调用链',
      '## ProjectStore：业务与持久化的分界',
      '## 关键不变量',
      '## 新代码放在哪里',
      '### 当前有意例外与待端口化边界',
      '### 业务动作索引',
    ]) {
      expect(guide).toContain(heading);
    }
    expect(guide).toContain('```mermaid');
    expect(guide).toContain('CollectionStore');
    expect(guide).toContain('services/store/collectionStore.ts');
    expect(guide).toContain('i18n/index.ts → platform/index.ts → i18n/');
    expect(guide).toContain('services/collection/create.ts');
    expect(guide).toContain('命令 → service → guard → 平台调用 → Store/报告 → 测试');

    const documentedBoundaries: Record<string, string> = {
      'core/auth.ts': '凭据解析优先级',
      'core/env.ts': '在网络 URL 解析和平台写操作前统一阻断 production',
      'config/project/store.ts': 'manifest/state',
      'config/project/writeLock.ts': 'AsyncLocalStorage',
      'config/project/projects.ts': '平台事实',
      'services/store/manifestStateStore.ts': '三方合并',
      'services/resource/publishVersion.ts': '发布管线',
      'services/batch/report.ts': '恢复事实源',
      'services/interactive/studioPublish.ts': 'Studio',
      'adapters/versionDraftAdapter.ts': 'fingerprint',
      'services/authorizationTree.ts': '直接依赖',
      'services/processFile.ts': '确定性',
    };

    for (const [relativePath, contractPhrase] of Object.entries(documentedBoundaries)) {
      const source = fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');
      expect(source, relativePath).toContain(contractPhrase);
    }

    const contractComments: Record<string, string> = {
      'config/project/store.ts': 'journal 保存的是 manifest/state 的最终目标快照',
      'config/project/projects.ts': 'remoteWriteConfirmed 只能跳过',
      'config/project/writeLock.ts': 'PID 检查除明确 ESRCH 外一律视为',
      'config/project/mapping.ts': 'manifest/state 与业务 DTO 的无 I/O 映射',
      'config/project/revision.ts': '工程快照的乐观并发控制',
      'config/project/schemaMigration.ts': '校验并迁移 manifest 文档',
      'services/store/manifestStateStore.ts': '读取基线 / 当前磁盘值 / 调用方意图',
      'services/batch/report.ts': '批量发行与 Studio 共用的恢复事实源',
      'services/batch/prepare.ts': '不能仅按 version 或 SHA1 认定成功',
      'services/resource/publishVersion.ts': '独立资源版本发布管线',
      'services/collection/items.ts': '合集目录草稿条目用例',
      'services/resourceTypeCapabilities.ts': '禁止按展示名猜测',
      'services/authorizationTree.ts': '每个 manifest 声明的直接依赖都必须在对应顶层分组有 active 路径',
    };

    for (const [relativePath, contractPhrase] of Object.entries(contractComments)) {
      const source = fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');
      expect(source, relativePath).toContain(contractPhrase);
    }
  });

  it('keeps collection persistence behind CollectionStore after subject selection', () => {
    const allowedBootstrap = new Set(['services/collection/create.ts']);
    const directPersistence = /\b(?:loadCollectionProject|saveCollectionProject|savePlatformCollectionState)\b/;
    const violations = files
      .map((file) => path.relative(sourceRoot, file).replaceAll('\\', '/'))
      .filter(
        (relativePath) =>
          relativePath.startsWith('services/collection/') || relativePath === 'services/collectionDraftService.ts',
      )
      .filter((relativePath) => !allowedBootstrap.has(relativePath))
      .filter((relativePath) => directPersistence.test(fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')));

    expect(violations).toEqual([]);
  });
});
