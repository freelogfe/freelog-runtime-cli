import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

const activeDocuments = [
  'README.md',
  'DESIGN.md',
  'docs/README.md',
  'docs/一期/README.md',
  'docs/一期/产品方案/README.md',
  'docs/一期/产品方案/00-方案总览与验收标准.md',
  'docs/一期/产品方案/01-需求分析与产品目标.md',
  'docs/一期/产品方案/02-Console业务流程字段接口.md',
  'docs/一期/产品方案/03-CLI环境差异与产品原则.md',
  'docs/一期/产品方案/04-CLI流程与命令设计.md',
  'docs/一期/产品方案/05-场景异常与验收方案.md',
  'docs/一期/产品方案/06-实现解决方案.md',
  'docs/一期/产品方案/07-项目上下文与接续记录.md',
  'packages/cli/README.md',
  'packages/cli/src/ARCHITECTURE.md',
  'test/README.md',
];

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function listMarkdown(relativePath: string): string[] {
  const result: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(path.join(repoRoot, current), { withFileTypes: true })) {
      const child = path.join(current, entry.name).replaceAll('\\', '/');
      if (entry.isDirectory()) visit(child);
      else if (entry.name.endsWith('.md')) result.push(child);
    }
  };
  visit(relativePath);
  return result;
}

describe('documentation governance', () => {
  it('keeps phase-one docs collapsed to one active product solution', () => {
    const phaseEntries = fs
      .readdirSync(path.join(repoRoot, 'docs/一期'), { withFileTypes: true })
      .map((entry) => entry.name)
      .sort();

    expect(phaseEntries).toEqual(['README.md', 'archive', '产品方案'].sort());

    const productEntries = fs
      .readdirSync(path.join(repoRoot, 'docs/一期/产品方案'))
      .filter((entry) => entry.endsWith('.md'))
      .sort();

    expect(productEntries).toEqual(
      [
        'README.md',
        '00-方案总览与验收标准.md',
        '01-需求分析与产品目标.md',
        '02-Console业务流程字段接口.md',
        '03-CLI环境差异与产品原则.md',
        '04-CLI流程与命令设计.md',
        '05-场景异常与验收方案.md',
        '06-实现解决方案.md',
        '07-项目上下文与接续记录.md',
      ].sort(),
    );
  });

  it('keeps every active design document labeled with a role', () => {
    const unlabeled = activeDocuments
      .filter((document) => document.startsWith('docs/'))
      .filter(
        (document) =>
          !read(document).split(/\r?\n/).slice(0, 10).join('\n').includes('文档角色'),
      );

    expect(unlabeled).toEqual([]);
  });

  it('keeps the product solution complete from demand to implementation', () => {
    const index = read('docs/一期/产品方案/README.md');
    const overview = read('docs/一期/产品方案/00-方案总览与验收标准.md');
    const demand = read('docs/一期/产品方案/01-需求分析与产品目标.md');
    const consoleContract = read('docs/一期/产品方案/02-Console业务流程字段接口.md');
    const cliPrinciples = read('docs/一期/产品方案/03-CLI环境差异与产品原则.md');
    const cliFlows = read('docs/一期/产品方案/04-CLI流程与命令设计.md');
    const scenarios = read('docs/一期/产品方案/05-场景异常与验收方案.md');
    const implementation = read('docs/一期/产品方案/06-实现解决方案.md');
    const handoff = read('docs/一期/产品方案/07-项目上下文与接续记录.md');
    const whole = [
      index,
      overview,
      demand,
      consoleContract,
      cliPrinciples,
      cliFlows,
      scenarios,
      implementation,
      handoff,
    ].join('\n');

    for (const keyword of [
      '需求分析',
      'Console 业务流程',
      'CLI 环境差异分析',
      'CLI 流程与命令设计',
      '主题开发者',
      '插件开发者',
      '工程/主题/插件开发者',
      '普通作者',
      '合集维护者',
      'RSS 合集',
      'collect-rules',
      'session',
      '多账号',
      'AI/CI',
      '模板/脚手架',
      '独立压缩',
      '内容来源',
      '字段约束',
      '平台接口',
      '异常恢复',
      '实现解决方案',
      '接续上下文',
      '敏感信息处理',
      '验收',
    ]) {
      expect(whole).toContain(keyword);
    }

    for (const consoleSource of [
      'src/pages/resource/creator',
      'src/pages/resource/versionCreator',
      'src/pages/resource/creatorBatch',
      'src/pages/resource/collectionCreator',
      'src/pages/resource/sidebar',
      'src/components/FPodcastRssSubmit',
    ]) {
      expect(consoleContract).toContain(consoleSource);
    }

    for (const api of [
      'Resource.resourceTypes',
      'Resource.ListSimpleByParentCode',
      'Resource.getResourceTypeInfoByCode',
      'Resource.create',
      'Resource.createVersion',
      'Resource.updateResourceVersionInfo',
      'Resource.createBatch',
      'Resource.updateCollection',
      'Resource.bindRssFeed',
      'Resource.setCollectRules',
      'Policy.policyTemplates',
      'Policy.policyReCompile',
      'Policy.policyTranslation',
    ]) {
      expect(consoleContract).toContain(api);
    }

    for (const flow of [
      '单资源创建流程',
      '已有资源更新流程',
      'sidebar 维护',
      '合集流程',
      'RSS 流程',
      'collect-rules 自动收录',
      '批量创建',
      '资源类型选择设计',
      '单资源发布流程',
      '批量流程',
      '独立模板创建流程',
      '独立压缩/打包流程',
      '发布流程内内容来源选择',
      'React 主题的两条正确入口',
    ]) {
      expect(whole).toContain(flow);
    }

    expect(consoleContract).toContain('tags 仍允许维护');
    expect(consoleContract).toContain('matchedItemCount > 1000');
    expect(consoleContract).toContain('VerificationCodeInvalid');
    expect(consoleContract).toContain('wrong_verified_code');
    expect(consoleContract).toContain('max(oldFeedItemCount, newFeedItemCount) - guidMatchedCount');
    expect(cliFlows).toContain('RSS 绑定后，标题、封面、简介由 feed 维护；tags 仍可维护');
    expect(cliFlows).toContain('从模板创建新工程');
    expect(cliFlows).toContain('使用现有主题/插件工程');
    expect(cliFlows).toContain('pack <目录>');
    expect(implementation).toContain('Command Layer');
    expect(implementation).toContain('Workflow Layer');
    expect(implementation).toContain('Local Resource Layer');
    expect(implementation).toContain('TemplateSelection');
    expect(implementation).toContain('PackPlan');
    expect(implementation).toContain('template_created');
    expect(handoff).toContain('D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource');
    expect(handoff).toContain('Freelog 授权策略帮助文档');
    expect(handoff).toContain('test/.freelog-test-credentials.local.json');
    expect(handoff).toContain('不写明文值');
  });

  it('keeps active docs free of references to archived active directories', () => {
    const forbiddenPatterns = [
      /docs\/新方案\/一期\/(?:对齐|开发|验证|使用|场景)\//,
      /docs\/新方案\/一期\/(?:01-产品设计总纲|02-CLI体验拓扑设计|03-多视角设计审查)\.md/,
      /docs\/新方案\/一期\/产品方案\/(?:08-|09-|10-)/,
      /新方案\/一期\/(?:对齐|开发|验证|使用|场景)\//,
      /docs\/新方案\//,
      /新方案\/一期\//,
    ];

    const violations = activeDocuments.flatMap((document) => {
      const source = read(document);
      return forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${document}: ${pattern.source}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps relative Markdown links in active docs resolvable', () => {
    const broken: string[] = [];

    for (const document of activeDocuments) {
      for (const match of read(document).matchAll(/\]\(([^)]+)\)/g)) {
        const href = match[1]!.trim().replace(/^<|>$/g, '');
        if (!href || href.startsWith('#') || /^[a-z]+:/i.test(href)) continue;

        const target = decodeURI(href.split('#')[0]!);
        const resolved = path.resolve(repoRoot, path.dirname(document), target);
        if (!fs.existsSync(resolved)) broken.push(`${document} -> ${href}`);
      }
    }

    expect(broken).toEqual([]);
  });

  it('keeps docs free of credentials and generated local project state', () => {
    const markdown = listMarkdown('docs').filter(
      (document) => !document.startsWith('docs/一期/archive/'),
    );
    const forbiddenPatterns = [
      /freelog-test11/,
      /authorization\s*[:=]/i,
      /cookie\s*[:=]/i,
      /token\s*[:=]/i,
      /D:\\appinside\\[^)\s]+/,
    ];

    const violations = markdown.flatMap((document) => {
      const source = read(document);
      return forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${document}: ${pattern.source}`);
    });

    expect(violations).toEqual([]);

    const forbiddenState: string[] = [];
    const visit = (absolutePath: string) => {
      for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
        if (['.git', 'node_modules', 'dist'].includes(entry.name)) continue;
        const child = path.join(absolutePath, entry.name);
        if (entry.name === '.freelog' || entry.name.startsWith('.freelog-auth')) {
          forbiddenState.push(path.relative(repoRoot, child));
          continue;
        }
        if (entry.isDirectory()) visit(child);
        else if (entry.name === 'freelog.manifest.json') {
          forbiddenState.push(path.relative(repoRoot, child));
        }
      }
    };

    visit(repoRoot);
    expect(forbiddenState).toEqual([]);
  });

  it('keeps the root design contract pointed at the collapsed solution', () => {
    const design = read('DESIGN.md');
    const docsIndex = read('docs/README.md');
    const phaseIndex = read('docs/一期/README.md');

    expect(design).toContain('唯一产品设计契约');
    expect(design).toContain('docs/一期/产品方案/README.md');
    expect(design).toContain('docs/一期/产品方案/00-方案总览与验收标准.md');
    expect(design).toContain('docs/一期/产品方案/07-项目上下文与接续记录.md');
    expect(design).toContain('06-实现解决方案.md');
    expect(docsIndex).toContain('一期/产品方案');
    expect(phaseIndex).toContain('最小活跃入口');
  });
});
