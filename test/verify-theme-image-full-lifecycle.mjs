#!/usr/bin/env node
/**
 * 主题与照片各自完整的 dev 发行/更新验收。
 *
 * 主题：线上模板 init → 用户构建 dist → 目录 zip 首版/更新版。
 * 照片：普通文件 init → 首版 → 换图片更新版。
 * 两条链均在同一资源上验证属性、可选配置、依赖、线上读回、策略、上下架。
 * 可用 --only theme|image 单独排查某一资源类型；不会把另一类型的失败误判为本类型失败。
 */
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const cliBin = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'index.js');
const envIndex = process.argv.indexOf('--env');
const env = envIndex >= 0 ? process.argv[envIndex + 1] ?? 'dev' : 'dev';
const skipBuild = process.argv.includes('--skip-build');
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : undefined;
// 仅用于定位存储解析差异：不改写图片，允许命中平台既有 SHA 记录。
const rawImage = process.argv.includes('--raw-image');
const reportDir = path.join(tmpdir(), 'freelog-runtime-cli-verification');
const reportPath = path.join(reportDir, 'theme-image-full-lifecycle.txt');
const lines = [];

class BlockedError extends Error {}

function log(line) {
  console.log(line);
  lines.push(line);
}

function blocked(message) {
  throw new BlockedError(message);
}

function runCli(label, args, cwd, input) {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    timeout: 300_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${label} (exit ${result.status})`);
  if (result.status !== 0 && output) log(`  ${output.slice(0, 700).replaceAll('\n', ' | ')}`);
  return { ok: result.status === 0, output };
}

function requirePass(result, label) {
  if (!result.ok) throw new Error(label);
}

function templateCatalogFrom(output) {
  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed?.templates) ? parsed.templates : [];
  } catch {
    return [];
  }
}

/**
 * 此脚本只把“自用免费”模板用于生命周期收尾，它没有用户参数。
 * 参数化模板的 number/select/datetime 覆盖由 verify-commands.mjs 独立负责，
 * 避免本脚本因某个后端测试模板的默认值失效而掩盖资源发行的结果。
 */
function applyFreePolicy(work, envArgs, policyName) {
  const catalog = runCli('policy template list --json', ['policy', 'template', 'list', '--json', ...envArgs], work);
  requirePass(catalog, '策略模板目录读取失败');
  const template = templateCatalogFrom(catalog.output).find((item) => item.title === '自用免费');
  if (!template) throw new Error('未返回“自用免费”策略模板');
  if (template.parameters.length > 0) throw new Error('“自用免费”策略模板意外包含用户参数，无法作为无参数验收模板');
  requirePass(runCli('policy template apply 自用免费', [
    'policy', 'template', 'apply', template.id,
    '--template-fingerprint', template.fingerprint,
    '--name', policyName,
    '--yes', ...envArgs,
  ], work), '添加免费策略失败');
}

function readFirstFile(dir) {
  for (const entry of readdirSync(dir)) {
    const candidate = path.join(dir, entry);
    if (statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`构建目录 ${dir} 没有可修改的文件`);
}

function copyDirectoryContents(source, destination) {
  for (const entry of readdirSync(source)) {
    cpSync(path.join(source, entry), path.join(destination, entry), { recursive: true });
  }
}

/**
 * 正常验收生成全新的标准 RGB PNG：不依赖缓存 SHA，也不修改或附加 fixture。
 * 它只有 PNG 必需的 IHDR / IDAT / IEND chunk，可将存储解析问题与测试造数隔离。
 */
function writeStandardPng(destination, width, height, color) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const start = row * (width * 3 + 1);
    for (let column = 0; column < width; column += 1) {
      const pixel = start + 1 + column * 3;
      raw[pixel] = color[0];
      raw[pixel + 1] = color[1];
      raw[pixel + 2] = color[2];
    }
  }
  writeFileSync(destination, Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function pngChunk(type, payload) {
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write(type, 4, 'ascii');
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + payload.length)), 8 + payload.length);
  return chunk;
}

function crc32(input) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertReadback(output, input) {
  const required = [
    input.attrKey,
    input.attrValue,
    input.selectKey,
    input.selectValue,
    input.description,
    input.dependency.resourceName,
    'select',
  ];
  if (!required.every((value) => output.includes(value))) {
    throw new Error(`${input.label} 线上版本没有完整读回属性、可选配置或依赖`);
  }
  if (output.includes(`"key": "${input.textKey}"`)) {
    throw new Error(`${input.label} 更新版仍包含已删除的文本可选配置`);
  }
  if (!input.expectArtifact(output)) {
    throw new Error(`${input.label} 线上发行物与预期不符`);
  }
}

function cleanup(work, envArgs) {
  try {
    const identityPath = path.join(work, '.freelog', '1.json');
    if (existsSync(identityPath) && JSON.parse(readFileSync(identityPath, 'utf8')).resourceId) {
      runCli('异常收尾 offline', ['offline', '--yes', ...envArgs], work);
    }
  } catch (error) {
    log(`WARN 异常收尾失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function testResource(spec, shared) {
  const work = mkdtempSync(path.join(tmpdir(), `freelog-${spec.kind}-full-`));
  const envArgs = ['--env', env];
  const stamp = `${Date.now().toString(36)}-${spec.kind}`;
  const attrKey = `qa${spec.kind}Author`;
  const textKey = `qa${spec.kind}Text`;
  const selectKey = `qa${spec.kind}Select`;
  const state = {
    label: spec.label,
    attrKey,
    attrValue: `${spec.kind}-second`,
    textKey,
    selectKey,
    selectValue: '更新',
    description: `${spec.kind} 更新版描述`,
    dependency: shared.dependency,
    expectArtifact: spec.expectArtifact,
  };
  let offlineCompleted = false;
  try {
    log(`\n=== ${spec.label} ===`);
    requirePass(runCli('login', ['login', '--login-name', shared.primary.loginName, '--password-stdin', '--yes', ...envArgs], work, shared.primary.password), `${spec.label} 登录失败`);
    const typeInfo = runCli('type info（确认可选配置）', ['type', 'info', spec.typeCode, ...envArgs], work);
    if (!typeInfo.ok || !typeInfo.output.includes('可选配置：支持')) {
      blocked(`${spec.label} 的 ${spec.typeCode} 当前未被后台标记为支持可选配置。`);
    }

    const artifact = await spec.prepareProject(work, envArgs);
    requirePass(runCli('create', [
      'create', '--title', `qa-${stamp}`, '--type', spec.typeCode, '--name', `qa-${stamp}`,
      '--artifact', artifact.initial, '--yes', ...envArgs,
    ], work), `${spec.label} 建壳失败`);
    requirePass(runCli('create-version --prepare', ['create-version', '--prepare', '--yes', ...envArgs], work), `${spec.label} 首版备稿失败`);
    requirePass(runCli('attr add', ['version', 'attr', 'add', `名称=验收作者 键=${attrKey} 值=${spec.kind}-first`, '--yes', ...envArgs], work), `${spec.label} 属性添加失败`);
    requirePass(runCli('dep add', ['version', 'dep', 'add', shared.dependency.resourceName, '--range', '^1.0.0', '--policy-id', shared.dependency.policyId, '--yes', ...envArgs], work), `${spec.label} 依赖添加/签约失败`);
    requirePass(runCli('option add 文本', ['version', 'option', 'add', `名称=测试文本 键=${textKey} 方式=文本 默认=first`, '--yes', ...envArgs], work), `${spec.label} 文本可选配置添加失败`);
    requirePass(runCli('option add 下拉', ['version', 'option', 'add', `名称=测试下拉 键=${selectKey} 方式=下拉 选项=稳定|更新`, '--yes', ...envArgs], work), `${spec.label} 下拉可选配置添加失败`);
    requirePass(runCli('create-version 1.0.0', ['create-version', '--yes', ...envArgs], work), `${spec.label} 首版提交失败`);
    if (existsSync(path.join(work, '.freelog', '1.version.json'))) throw new Error(`${spec.label} 首版成功后工作稿未删除`);
    const first = runCli('version show 1.0.0', ['version', 'show', '--version', '1.0.0', ...envArgs], work);
    requirePass(first, `${spec.label} 首版读回失败`);
    for (const expected of [attrKey, `${spec.kind}-first`, textKey, selectKey, shared.dependency.resourceName, 'editableText', 'select']) {
      if (!first.output.includes(expected)) throw new Error(`${spec.label} 首版未读回 ${expected}`);
    }
    if (!spec.expectFirstArtifact(first.output)) throw new Error(`${spec.label} 首版发行物不符合形态`);

    requirePass(runCli('draft pull', ['version', 'draft', 'pull', '--yes', ...envArgs], work), `${spec.label} 更新版拉稿失败`);
    requirePass(runCli('draft description', ['version', 'draft', 'description', '--description', state.description, ...envArgs], work), `${spec.label} 更新稿描述修改失败`);
    requirePass(runCli('attr set', ['version', 'attr', 'set', `键=${attrKey} 值=${state.attrValue}`, '--yes', ...envArgs], work), `${spec.label} 属性修改失败`);
    requirePass(runCli('option set 下拉', ['version', 'option', 'set', `键=${selectKey} 方式=下拉 选项=更新|稳定`, '--yes', ...envArgs], work), `${spec.label} 下拉可选配置修改失败`);
    requirePass(runCli('option rm 文本', ['version', 'option', 'rm', textKey, ...envArgs], work), `${spec.label} 文本可选配置删除失败`);
    requirePass(runCli('dep range', ['version', 'dep', 'range', shared.dependency.resourceId, '--range', '^1.0.0', '--policy-id', shared.dependency.policyId, '--yes', ...envArgs], work), `${spec.label} 依赖范围更新失败`);
    await artifact.prepareUpdate();
    requirePass(runCli('update-version 1.1.0', ['update-version', '--version', '1.1.0', '--artifact', artifact.updated, '--yes', ...envArgs], work), `${spec.label} 更新版提交失败`);
    if (existsSync(path.join(work, '.freelog', '1.version.json'))) throw new Error(`${spec.label} 更新版成功后工作稿未删除`);
    const identity = JSON.parse(readFileSync(path.join(work, '.freelog', '1.json'), 'utf8'));
    if (identity.filePath !== artifact.updated) throw new Error(`${spec.label} 更新成功后 N.json 没有回写当前产物路径`);
    const second = runCli('version show 1.1.0', ['version', 'show', '--version', '1.1.0', ...envArgs], work);
    requirePass(second, `${spec.label} 更新版读回失败`);
    assertReadback(second.output, state);

    // 策略名平台上限为 20 字；资源 kind 不能再拼入，以免主题/图片验收名越界。
    const policyName = `验收${stamp}`;
    applyFreePolicy(work, envArgs, policyName);
    const policyList = runCli('policy list', ['policy', 'list', ...envArgs], work);
    if (!policyList.ok || !policyList.output.includes(policyName)) throw new Error(`${spec.label} 策略列表未读回新增策略`);
    requirePass(runCli('validate --for online', ['validate', '--for', 'online', '--yes', ...envArgs], work), `${spec.label} 上架预检失败`);
    requirePass(runCli('online', ['online', '--yes', ...envArgs], work), `${spec.label} 上架失败`);
    const status = runCli('status（上架态）', ['status', ...envArgs], work);
    requirePass(status, `${spec.label} 上架后状态读取失败`);
    requirePass(runCli('offline', ['offline', '--yes', ...envArgs], work), `${spec.label} 下架收尾失败`);
    offlineCompleted = true;
    log(`PASS ${spec.label}：模板/产物、属性、可选配置、依赖、首版、更新版、策略、上下架均已真实验证`);
  } finally {
    if (offlineCompleted) rmSync(work, { recursive: true, force: true });
    else cleanup(work, envArgs);
  }
}

async function main() {
  if (env !== 'dev') blocked('本脚本只允许 --env dev。');
  if (only !== undefined && only !== 'theme' && only !== 'image') {
    blocked('--only 只能是 theme 或 image。');
  }
  if (!existsSync(cliBin)) blocked('缺少 CLI 构建产物。');
  const credentialPath = path.join(testRoot, '.freelog-test-credentials.local.json');
  const poolPath = path.join(testRoot, '.freelog-test-resource-pool.local.json');
  const themeArtifact = path.join(testRoot, 'fixtures', 'theme-artifact');
  const imageV1 = path.join(testRoot, 'fixtures', 'media', 'sample-image.png');
  const imageV2 = path.join(testRoot, 'fixtures', 'media', 'sample-cover.png');
  if (![credentialPath, poolPath, themeArtifact, imageV1, imageV2].every(existsSync)) {
    blocked('缺少凭据、资源池、主题 dist 或图片 fixture。');
  }
  const primary = JSON.parse(readFileSync(credentialPath, 'utf8')).primary;
  const dependency = JSON.parse(readFileSync(poolPath, 'utf8')).resources
    ?.find((item) => typeof item?.resourceName === 'string' && typeof item?.policyId === 'string');
  if (!primary?.loginName || !primary?.password || !dependency) blocked('primary 凭据或资源池依赖条目无效。');
  if (!skipBuild) {
    const build = spawnSync('pnpm', ['--filter', '@freelog-cli/cli2', 'build'], {
      cwd: repoRoot, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000,
    });
    if (build.status !== 0) throw new Error('CLI 构建失败');
  }
  const shared = { primary, dependency };
  const theme = {
    kind: 'theme', label: '主题 RT001（线上模板 → dist 目录 zip）', typeCode: 'RT001',
    prepareProject: async (work, envArgs) => {
      requirePass(runCli('init theme --template vite-react-ts', ['init', 'theme', '.', '--template', 'vite-react-ts', '--yes', ...envArgs], work), '主题模板创建失败');
      if (!existsSync(path.join(work, 'package.json'))) throw new Error('主题模板未复制 package.json');
      const dist = path.join(work, 'dist');
      copyDirectoryContents(themeArtifact, dist);
      return {
        initial: 'dist', updated: 'dist',
        prepareUpdate: async () => appendFileSync(readFirstFile(dist), `\n/* lifecycle-${Date.now()} */\n`, 'utf8'),
      };
    },
    expectFirstArtifact: (output) => output.includes('.zip'),
    expectArtifact: (output) => output.includes('.zip'),
  };
  const image = {
    kind: 'image', label: '照片 RT005001（普通单文件 → 换图）', typeCode: 'RT005001',
    prepareProject: async (work, envArgs) => {
      const first = path.join(work, 'photo-v1.png');
      const second = path.join(work, 'photo-v2.png');
      // dev 会按 SHA 拒绝重复图片。--raw-image 只用于排查平台存储解析，不能作为完整更新版验收。
      if (rawImage) {
        cpSync(imageV1, first);
        cpSync(imageV2, second);
      } else {
        const stamp = Date.now();
        writeStandardPng(first, 882, 562, [stamp & 255, (stamp >>> 8) & 255, (stamp >>> 16) & 255]);
        writeStandardPng(second, 882, 562, [(stamp + 97) & 255, ((stamp + 97) >>> 8) & 255, ((stamp + 97) >>> 16) & 255]);
      }
      requirePass(runCli('init --type RT005001 --artifact photo-v1.png', ['init', '.', '--type', 'RT005001', '--artifact', 'photo-v1.png', '--yes', ...envArgs], work), '照片 init 失败');
      return { initial: 'photo-v1.png', updated: 'photo-v2.png', prepareUpdate: async () => undefined };
    },
    expectFirstArtifact: (output) => output.includes('photo-v1.png'),
    expectArtifact: (output) => output.includes('photo-v2.png'),
  };
  if (only !== 'image') await testResource(theme, shared);
  if (only !== 'theme') await testResource(image, shared);
}

try {
  await main();
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `${lines.join('\n')}\n\n结果: PASS\n`, 'utf8');
  log(`报告: ${reportPath}`);
} catch (error) {
  mkdirSync(reportDir, { recursive: true });
  const result = error instanceof BlockedError ? 'BLOCKED' : 'FAIL';
  const message = error instanceof Error ? error.message : String(error);
  writeFileSync(reportPath, `${lines.join('\n')}\n\n结果: ${result}\n原因: ${message}\n`, 'utf8');
  console.error(`${result}: ${message}`);
  console.error(`报告: ${reportPath}`);
  process.exitCode = error instanceof BlockedError ? 3 : 1;
}
