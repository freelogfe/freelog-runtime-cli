/**
 * 从旧版单页手册拆分为分册（一次性/维护用）。
 * 源文件已改为索引页；如需重新生成，先从 git 历史恢复单页内容到 _source-monolith.md。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const srcPath = path.join(repoRoot, 'docs/新方案/使用/_source-monolith.md');
const outDir = path.join(repoRoot, 'docs/新方案/使用');
const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);

function extract(start, end) {
  const si = lines.findIndex((l) => l === start);
  const ei = end ? lines.findIndex((l) => l === end) : lines.length;
  if (si < 0) throw new Error(`start not found: ${start}`);
  return lines.slice(si, ei >= 0 ? ei : lines.length);
}

function header(meta) {
  return [
    '---',
    `title: ${meta.title}`,
    `description: Freelog CLI 使用说明 — ${meta.title}`,
    'sidebar:',
    `  order: ${meta.order}`,
    '---',
    '',
    `# ${meta.title}`,
    '',
    '> 文档角色：当前版本的派生使用说明；不定义产品范围、字段或完成状态。发生冲突时以仓库根目录 [DESIGN.md](../../../DESIGN.md) 和当前 `--help` 为准。',
    '',
    '最后更新：2026-08-12',
    '',
    '[← CLI 使用文档目录](./README.md)',
    '',
    '',
  ].join('\n');
}

const refMap = [
  [/见 §8、§14/g, '见 [合集](./合集.md)、[工程化与预检](./工程化与预检.md)'],
  [/见 §1「自动化与 JSON」/g, '见 [全局参数与登录 — 自动化与 JSON](./全局参数与登录.md#自动化与-json)'],
  [/与 §1 全局参数一致/g, '与 [全局参数与登录](./全局参数与登录.md) 全局参数一致'],
  [/下文按业务流程展开。/g, '其余场景见 [使用文档目录](./README.md)。'],
];

function transform(body, strip) {
  let out = body.join('\n').replace(strip, '## ');
  out = out.replace(/^## \d+\. /gm, '## ');
  for (const [re, rep] of refMap) out = out.replace(re, rep);
  return out.trim() + '\n';
}

const splits = [
  {
    file: '全局参数与登录.md',
    title: '全局参数与登录',
    order: 3,
    start: '## 1. 基本流程',
    end: '## 2. 准备',
    strip: /^## 1\. /,
  },
  {
    file: '准备与本地文件.md',
    title: '准备与本地文件',
    order: 4,
    parts: [
      { start: '## 2. 准备', end: '## 3. Console 对齐状态', strip: /^## 2\. / },
      { start: '## 4. 本地文件', end: '## 5. 主题或插件项目发布', strip: /^## 4\. / },
    ],
  },
  {
    file: 'Console差异说明.md',
    title: 'Console 差异说明',
    order: 14,
    start: '## 3. Console 对齐状态',
    end: '## 4. 本地文件',
    strip: /^## 3\. /,
  },
  {
    file: '发行单个资源.md',
    title: '发行单个资源',
    order: 5,
    start: '## 5. 主题或插件项目发布',
    end: '## 7. 文件夹发布为多个独立资源',
    strip: /^## [56]\. /,
  },
  {
    file: '批量发行.md',
    title: '批量发行',
    order: 6,
    start: '## 7. 文件夹发布为多个独立资源',
    end: '## 8. 文件夹作为合集',
    strip: /^## 7\. /,
  },
  {
    file: '合集.md',
    title: '合集',
    order: 7,
    start: '## 8. 文件夹作为合集',
    end: '## 9. 更新基础信息',
    strip: /^## 8\. /,
  },
  {
    file: '维护与草稿.md',
    title: '维护与草稿',
    order: 8,
    start: '## 9. 更新基础信息',
    end: '## 11. 策略和上下架',
    strip: /^## (9|10)\. /,
  },
  {
    file: '策略与上下架.md',
    title: '策略与上下架',
    order: 9,
    start: '## 11. 策略和上下架',
    end: '## 12. 依赖授权',
    strip: /^## 11\. /,
  },
  {
    file: '依赖与授权.md',
    title: '依赖与授权',
    order: 10,
    start: '## 12. 依赖授权',
    end: '## 13. 工程化与发版辅助（2026-08-10）',
    strip: /^## 12\. /,
  },
  {
    file: '工程化与预检.md',
    title: '工程化与预检',
    order: 11,
    start: '## 13. 工程化与发版辅助（2026-08-10）',
    end: '## 15. 特殊流程（与 Console 写法不同）',
    strip: /^## 1[34]\. /,
  },
  {
    file: '特殊流程.md',
    title: '特殊流程',
    order: 12,
    start: '## 15. 特殊流程（与 Console 写法不同）',
    end: '## 16. 常见排错',
    strip: /^## 15\. /,
  },
  {
    file: '排错与验收.md',
    title: '排错与验收',
    order: 13,
    start: '## 16. 常见排错',
    end: null,
    strip: /^## 1[678]\. /,
  },
];

for (const s of splits) {
  let body;
  if (s.parts) {
    body = s.parts.map((p) => transform(extract(p.start, p.end), p.strip)).join('\n\n');
  } else {
    body = transform(extract(s.start, s.end), s.strip);
  }
  fs.writeFileSync(path.join(outDir, s.file), header(s) + body, 'utf8');
  console.log('wrote', s.file);
}
