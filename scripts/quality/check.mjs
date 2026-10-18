/** 离线入口校验：检查文档目标、workspace 脚本及明显秘密；不执行账号/发布操作。 */
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const normalize = (value) => value.replaceAll('\\', '/');

export function documentProblems(content, file, root, exists = existsSync) {
  const errors = [];
  const fences = content.match(/^\s*```/gm) ?? [];
  if (fences.length % 2) errors.push(`${file}: 代码围栏未闭合`);
  const prose = content.replace(/^\s*```[^\n]*\r?\n[\s\S]*?^\s*```[^\n]*/gm, '');
  for (const match of prose.matchAll(/\[[^\]\n]+\]\((<[^>]+>|[^)\s]+)\)/g)) {
    const href = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(href)) continue;
    let target;
    try { target = decodeURIComponent(href.split('#')[0]); } catch { errors.push(`${file}: 链接编码无效`); continue; }
    if (!target) continue;
    const absolute = path.resolve(root, path.dirname(file), target);
    const relative = path.relative(path.resolve(root), absolute);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      errors.push(`${file}: 链接越出仓库 ${target}`);
    } else if (!exists(absolute)) errors.push(`${file}: 失效链接 ${target}`);
  }
  return errors;
}

export function scriptProblems(content, packages, rootScripts = undefined) {
  const errors = [];
  for (const match of content.matchAll(/pnpm\s+(--fail-if-no-match\s+)?--filter\s+["']?(@[\w./-]+)["']?\s+([\w:-]+)/g)) {
    const [, strict, name, script] = match;
    if (!strict) errors.push(`workspace ${name}: 必须使用 --fail-if-no-match`);
    if (!packages[name]) errors.push(`不存在 workspace ${name}`);
    else if (!Object.hasOwn(packages[name], script)) errors.push(`workspace ${name}: 不存在脚本 ${script}`);
  }
  if (rootScripts) {
    const builtins = new Set(['install', 'exec', 'run', 'test', 'publish', 'pack']);
    for (const match of content.matchAll(/pnpm\s+(?:run\s+)?([a-z][\w:-]*)/g)) {
      if (!builtins.has(match[1]) && !Object.hasOwn(rootScripts, match[1])) errors.push(`不存在根脚本 ${match[1]}`);
    }
  }
  return errors;
}

export function sourceProblems(file, content) {
  const safe = normalize(file);
  const name = path.posix.basename(safe);
  const errors = [];
  if (name === '.npmrc' || (name.startsWith('.env') && name !== '.env.example')
    || /^\.freelog-test-(credentials|fixtures|optional-config)\.local\.json$/.test(name)
    || /(?:^|\/)\.freelog\/(?:auth|auth\.json)$/.test(safe)) {
    errors.push(`${safe}: 私有认证/测试输入禁止进入版本库`);
  }
  const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bnpm_[A-Za-z0-9]{30,}\b/, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, /\bAKIA[A-Z0-9]{16}\b/];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (patterns.some((pattern) => pattern.test(line))) errors.push(`${safe}:${index + 1}: 检测到明显秘密形态（内容已隐藏）`);
  }
  return errors;
}

function gitFiles() {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repoRoot, encoding: 'utf8', timeout: 15_000 });
  if (result.error || result.signal || result.status !== 0) throw new Error('无法取得版本库文件清单，拒绝跳过检查');
  return [...new Set(result.stdout.split('\0').filter(Boolean))];
}

function markdownFiles(directory) {
  return readdirSync(path.join(repoRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? markdownFiles(file) : entry.isFile() && entry.name.endsWith('.md') ? [file] : [];
  });
}

export function checkRepository({ readDocument = (file) => readFileSync(path.join(repoRoot, file), 'utf8') } = {}) {
  const errors = [];
  const files = gitFiles();
  for (const file of files) {
    const absolute = path.join(repoRoot, file);
    if (!existsSync(absolute)) continue; // git 中尚未提交的删除不是待发布内容。
    if (lstatSync(absolute).isSymbolicLink()) { errors.push(`${file}: 版本库软链接需显式审查`); continue; }
    const text = /\.(?:[cm]?[jt]sx?|json|md|ya?ml|toml|txt)$/.test(file) || path.basename(file).startsWith('.env') || path.basename(file) === '.npmrc';
    errors.push(...sourceProblems(file, text ? readFileSync(absolute, 'utf8') : ''));
  }
  const docs = ['AGENTS.md', 'README.md', 'DESIGN.md', 'docs/README.md', 'packages/cli/src/ARCHITECTURE.md',
    'docs/一期/产品方案/交接文档.md',
    'test/README.md', 'test/DEV-全流程测试计划.md', 'test/acceptance/README.md', 'docs/一期/产品方案/开发/README.md',
    'docs/一期/产品方案/脚手架设计/COMMANDS.md', ...markdownFiles('docs/研发交付规范'), ...markdownFiles('docs/一期/产品方案/使用')];
  for (const file of docs) errors.push(...documentProblems(readDocument(file), file, repoRoot));
  const roots = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts;
  const packages = Object.fromEntries(['cli', 'tools-lib'].map((name) => {
    const json = JSON.parse(readFileSync(path.join(repoRoot, 'packages', name, 'package.json'), 'utf8'));
    return [json.name, json.scripts];
  }));
  for (const script of Object.values(roots)) errors.push(...scriptProblems(script, packages, roots));
  for (const scripts of Object.values(packages)) {
    for (const script of Object.values(scripts)) errors.push(...scriptProblems(script, packages, scripts));
  }
  const workflow = readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  errors.push(...scriptProblems(workflow, packages, roots));
  return { filesChecked: files.length, documentsChecked: docs.length, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkRepository();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.errors.length ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
