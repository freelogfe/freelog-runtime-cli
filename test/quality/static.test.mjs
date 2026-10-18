import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { acceptanceCatalog } from '../acceptance/catalog.mjs';
import { checkRepository, documentProblems, scriptProblems, sourceProblems } from '../../scripts/quality/check.mjs';

const handoffFile = 'docs/一期/产品方案/交接文档.md';
const historyHref = './独立交接历史.md';
const readRepositoryFile = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

function handoffProblems(content) {
  const headings = [...content.matchAll(/^## ([^\r\n]+)/gmu)];
  const expectedHeadings = ['新会话执行协议（必读）', '当前目标与范围', '当前状态与未决操作', '工程缺口与证据范围', '下一步', '历史记录'];
  const errors = [];
  if (JSON.stringify(headings.map((item) => item[1])) !== JSON.stringify(expectedHeadings)) errors.push('活动章节缺失、重复或混入历史活动区');
  const protocol = content.slice(headings[0]?.index ?? 0, headings[1]?.index ?? content.length);
  const listed = [...protocol.matchAll(/`([A-Z_]+\.[A-Z_.]+)`/gu)].map((item) => item[1]);
  const gaps = acceptanceCatalog.filter((item) => item.required && item.gap).map((item) => item.id);
  if (JSON.stringify(listed.sort()) !== JSON.stringify(gaps.sort())) errors.push('必需gap集合不一致');
  const historyLinks = [...content.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/gu)].filter((item) => item[1] === historyHref);
  if (historyLinks.length !== 1) errors.push('独立历史入口缺失或重复');
  return errors;
}

test('错误 workspace、缺失脚本和非严格 filter 不得成为绿色检查', () => {
  const packages = { '@freelog-cli/cli2': { verify: 'x' } };
  assert.ok(scriptProblems('pnpm --filter @freelog-cli/cli verify:offline', packages).length);
  assert.ok(scriptProblems('pnpm --filter @freelog-cli/cli2 missing', packages).length);
  assert.ok(scriptProblems('pnpm --filter @freelog-cli/cli2 verify', packages).length);
  assert.deepEqual(scriptProblems('pnpm --fail-if-no-match --filter @freelog-cli/cli2 verify', packages), []);
});

test('失效文档目标、失配围栏和仓外路径被拒绝', () => {
  const exists = (file) => file.endsWith('exists.md');
  assert.ok(documentProblems('[缺失](missing.md)', 'docs/a.md', '/repo', exists).length);
  assert.ok(documentProblems('```js\nconst x = 1;', 'docs/a.md', '/repo', exists).length);
  assert.ok(documentProblems('[越界](../../secrets.md)', 'docs/a.md', '/repo', exists).length);
  assert.deepEqual(documentProblems('[有效](exists.md) [外部](https://example.com/a)', 'docs/a.md', '/repo', exists), []);
});

test('认证文件与明显密钥不可进入源码，只报告位置不报告秘密', () => {
  assert.ok(sourceProblems('.npmrc', 'registry=https://example.com').length);
  assert.ok(sourceProblems('test/.freelog-test-credentials.local.json', '{}').length);
  const secret = 'npm_' + 'a'.repeat(36);
  const errors = sourceProblems('src/a.ts', `const token = '${secret}';`);
  assert.ok(errors.length);
  assert.ok(errors.every((error) => !error.includes(secret)));
  assert.deepEqual(sourceProblems('test/.freelog-test-resource-pool.local.json', '{"resources":[]}'), []);
});

test('交接文档必须纳入活动文档静态检查，不能只检查它的入口链接', () => {
  // 只在内存中注入坏链接，不改用户文档；必须由实际文档遍历和校验报出。
  const result = checkRepository({ readDocument: (file) => {
    const content = readRepositoryFile(file);
    return file === handoffFile ? `${content}\n[断链探针](./__missing_handoff_contract_probe__.md)\n` : content;
  } });
  assert.ok(result.errors.includes(`${handoffFile}: 失效链接 ./__missing_handoff_contract_probe__.md`));
});

test('新会话入口固定在交接顶部并由AGENTS指引，不能藏在历史增量后面', () => {
  const handoff = readRepositoryFile(handoffFile);
  const agents = readRepositoryFile('AGENTS.md');
  const headings = [...handoff.matchAll(/^## ([^\r\n]+)/gmu)];
  assert.equal(headings[0]?.[1], '新会话执行协议（必读）');
  assert.ok(agents.includes('新会话执行协议（必读）'));
});

test('活动交接只有一套当前结构，七项gap和独立历史入口完整', () => {
  assert.deepEqual(handoffProblems(readRepositoryFile(handoffFile)), []);
});

test('结构回归拒绝重复活动区、历史下一步混入、缺口遗漏和历史入口删除', () => {
  const handoff = readRepositoryFile(handoffFile);
  assert.ok(handoffProblems(`${handoff}\n## 当前目标与范围\n旧任务\n`).includes('活动章节缺失、重复或混入历史活动区'));
  assert.ok(handoffProblems(`${handoff}\n## 当前下一步顺序\n历史操作\n`).includes('活动章节缺失、重复或混入历史活动区'));
  const gap = acceptanceCatalog.find((item) => item.required && item.gap);
  assert.ok(gap, '回归必须实际覆盖一个未实现必需项');
  const missingGap = handoff.split(/\r?\n/u).filter((line) => !line.includes(`\`${gap.id}\``)).join('\n');
  assert.ok(handoffProblems(missingGap).includes('必需gap集合不一致'));
  assert.ok(handoffProblems(handoff.replace(historyHref, './deleted-history.md')).includes('独立历史入口缺失或重复'));
});

test('历史相对链接存在且明确非操作依据，入口锚点仍指向首协议', () => {
  const historyUrl = new URL(historyHref, new URL(`../../${handoffFile}`, import.meta.url));
  assert.ok(existsSync(historyUrl), '活动交接引用的历史页必须真实存在');
  const history = readFileSync(historyUrl, 'utf8');
  assert.match(history, /^# 独立交接历史\r?\n\r?\n只作历史事实，不是操作依据。/u);
  const snapshot = history.slice(history.indexOf('\n# 交接文档') + 1);
  // Git可按平台转换换行；仅规范换行后核对全文，原始字节复制另有当次记录。
  assert.equal(createHash('sha256').update(snapshot.replaceAll('\r\n', '\n')).digest('hex'), '918808d641f1f9d00903b926f8236be3f676466e501fa292e4192fe2be6bc500', '整理前的完整原文不得丢失或改写');
  const handoff = readRepositoryFile(handoffFile);
  for (const file of ['AGENTS.md', 'DESIGN.md']) {
    assert.ok(readRepositoryFile(file).includes('docs/一期/产品方案/交接文档.md#新会话执行协议必读'), `${file}: 缺少活动协议锚点入口`);
  }
  assert.equal([...handoff.matchAll(/^## ([^\r\n]+)/gmu)][0]?.[1], '新会话执行协议（必读）');
});

test('第二次交接精简完整保留原文快照，活动入口与历史事实分离', () => {
  const archive = readRepositoryFile('docs/一期/产品方案/交接证据归档-2026-10-18.md');
  assert.match(archive, /只作历史事实，不是操作依据/u);
  const start = archive.indexOf('\n# 交接文档');
  assert.ok(start > 0);
  assert.equal(createHash('sha256').update(archive.slice(start + 1).replaceAll('\r\n', '\n')).digest('hex'),
    '39d6dbf4f4be9c760de2f85ed0a76eec71226b3e2be75a99e684b03feab5c5ac');
  assert.ok(readRepositoryFile(handoffFile).includes('./交接证据归档-2026-10-18.md'));
});

test('本次修改的交接入口和历史相对目标有效，交接锚点真实存在', () => {
  const files = ['AGENTS.md', 'DESIGN.md', handoffFile, 'docs/一期/产品方案/开发/01-实现顺序.md'];
  const headings = [...readRepositoryFile(handoffFile).matchAll(/^#{1,6} (.+)$/gmu)]
    .map((item) => item[1].trim().toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').replaceAll(' ', '-'));
  let checkedAnchors = 0;
  for (const file of files) {
    const content = readRepositoryFile(file);
    for (const [, href] of content.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/gu)) {
      if (!href.includes('交接文档.md') && !href.includes('独立交接历史.md')) continue;
      const target = new URL(href, new URL(`../../${file}`, import.meta.url));
      const targetFile = new URL(target);
      targetFile.hash = '';
      assert.ok(existsSync(targetFile), `${file}: 交接相对目标不存在`);
      if (target.hash && href.includes('交接文档.md')) {
        assert.ok(headings.includes(decodeURIComponent(target.hash.slice(1))), `${file}: 交接锚点不存在 ${target.hash}`);
        checkedAnchors += 1;
      }
    }
  }
  assert.ok(checkedAnchors >= 4, '必须真实检查AGENTS、DESIGN与开发入口的交接锚点');
});
