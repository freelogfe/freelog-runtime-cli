#!/usr/bin/env node
/**
 * 主题与照片各自完整的 dev 发行/更新验收。
 *
 * 主题：线上模板 init → 用户构建 dist → 目录 zip 首版/更新版。
 * 照片：PNG 与真正 JPEG 分别普通文件 init → 首版 → 换图片更新版。
 * 三条链均在同一资源上验证属性、可选配置、依赖、线上读回、策略、上下架。
 * 可用 --only theme|image|jpeg 单独排查某一类型；不会把另一类型的失败误判为本类型失败。
 * 本轮回归清单（先锁定场景，再执行真实账号验收）：
 * - 主题附加字段展示、填写、显式清空、首版读回、拉稿恢复及更新继承。
 * - 缺值/未知键/实际只读字段/系统键名冲突拒绝，纯表单负例不改稿。
 * - 手改 JSON 重名、未知附加项、非法类型/超长值在真正提交入口拒绝且保留数据。
 * - 自定义属性、空默认文本配置、下拉配置和依赖在首版与更新版均按 JSON 精确断言。
 * - 失败保留工程和远端现状，成功下架并退出本地登录；报告保留已知新资源 ID。
 */
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveCliBin, skipWorkspaceBuild } from './acceptance/cli-bin.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { redactEvidence } from './acceptance/evidence-redaction.mjs';
import { classifyTypeCapability } from './acceptance/type-capability-evidence.mjs';
import { evaluateVersionLifecycle, initialVersionLifecycleCases, replaceVersionLifecycleResult, versionLifecycleCases } from './acceptance/version-lifecycle-evidence.mjs';
import { retainLifecycleArtifact } from './acceptance/lifecycle-artifact.mjs';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
let cliBin;
const envIndex = process.argv.indexOf('--env');
const env = envIndex >= 0 ? process.argv[envIndex + 1] ?? 'dev' : 'dev';
const skipBuild = skipWorkspaceBuild();
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : undefined;
// 仅用于定位存储解析差异：不改写图片，允许命中平台既有 SHA 记录。
const rawImage = process.argv.includes('--raw-image');
const reportDir = process.env.FREELOG_TEST_SUITE_REPORT
  ? path.dirname(process.env.FREELOG_TEST_SUITE_REPORT) : path.join(tmpdir(), 'freelog-runtime-cli-verification');
const reportPath = path.join(reportDir, 'theme-image-full-lifecycle.txt');
const lines = [];
const resources = [];
const secrets = [];
const redact = (value) => redactEvidence(value, secrets);
const cases = initialVersionLifecycleCases(only);
let activeRecord;
let activeKind;

class BlockedError extends Error {}

function log(line) {
  const safe = redact(line);
  console.log(safe);
  lines.push(safe);
}

function blocked(message) {
  throw new BlockedError(message);
}

function runCli(label, args, cwd, input, expectedExit = 'success') {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    timeout: 300_000,
  });
  // Business parsing uses the original response. Only diagnostics and retained action text are redacted.
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const completed = !result.error && result.signal === null && Number.isInteger(result.status);
  const expected = completed && (expectedExit === 'reject' ? result.status !== 0 : result.status === 0);
  const safeArgs = args.map((arg, index) => args[index - 1] === '--login-name' ? '<primary-login>' : arg);
  log(`${expected ? 'PASS' : 'FAIL'} ${label} (exit ${result.status}, signal ${result.signal ?? 'none'}) command=${JSON.stringify(safeArgs)}`);
  if (result.error) log(`  spawn error: ${result.error.message}`);
  if (result.status !== 0 && output) log(`  ${redact(output).slice(0, 900).replaceAll('\n', ' | ')}`);
  activeRecord?.actions.push({ label, argv: safeArgs, expectedExit: expectedExit === 'reject' ? 1 : 0,
    process: { exitCode: result.status ?? null, signal: result.signal ?? null, error: result.error ? redact(result.error.message) : null,
      timedOut: result.error?.code === 'ETIMEDOUT' }, stdout: redact(result.stdout), stderr: redact(result.stderr) });
  return { ok: completed && result.status === 0, completed, status: result.status, output };
}

function requirePass(result, label) {
  if (!result.ok) throw new Error(label);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  log(`PASS ASSERT ${message}`);
}

function readDraft(work) {
  return JSON.parse(readFileSync(path.join(work, '.freelog', '1.version.json'), 'utf8'));
}

function versionJson(output) {
  // 有工作稿时 version show 会先打印一行提示，JSON 仍是唯一的版本详情。
  const start = output.indexOf('{');
  if (start < 0) throw new Error('version show 没有 JSON 版本详情');
  const value = JSON.parse(output.slice(start));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('version show JSON 不是对象');
  return value;
}

function assertInputAttrs(draft, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    const item = draft.inputAttrs?.find((entry) => entry.key === key);
    assert(item && item.value === value, `${label} inputAttrs ${key}=${JSON.stringify(value)}`);
  }
}

function rejectWithoutDraftChange(work, envArgs, label, args, errorPattern) {
  const file = path.join(work, '.freelog', '1.version.json');
  const before = readFileSync(file);
  const result = runCli(label, [...args, '--yes', ...envArgs], work, undefined, 'reject');
  assert(result.completed && !result.ok && errorPattern.test(result.output), `${label} 是预期业务拒绝（不是进程崩溃/超时）`);
  assert(before.equals(readFileSync(file)), `${label} 原工作稿字节不变`);
}

/** 初始版本尚未存在时走真正 create-version，不把门禁挡住误算成字段验证通过。 */
function rejectTamperedDrafts(work, envArgs) {
  const file = path.join(work, '.freelog', '1.version.json');
  const original = readFileSync(file, 'utf8');
  const cases = [
    {
      label: '手改稿：自定义属性名称重复', pattern: /键或名称重复/u,
      mutate(draft) {
        draft.customPropertyDescriptors.push({ ...draft.customPropertyDescriptors[0], key: 'qaDuplicateName' });
      },
      preserved(draft) {
        const first = draft.customPropertyDescriptors[0];
        return draft.customPropertyDescriptors.some((item) => item.key === 'qaDuplicateName' && item.name === first.name);
      },
    },
    {
      label: '手改稿：未知附加属性', pattern: /复核附加属性|系统附加属性|附加属性.*无效/u,
      mutate(draft) { draft.inputAttrs.push({ key: 'qaUnknownSystemAttr', value: 'preserve-me' }); },
      preserved(draft) {
        return [...draft.inputAttrs, ...draft.orphanedInputAttrs].some((item) => item.key === 'qaUnknownSystemAttr' && item.value === 'preserve-me');
      },
    },
    {
      label: '手改稿：非法自定义类型', pattern: /不支持属性类型/u,
      mutate(draft) { draft.customPropertyDescriptors[0].type = 'unsupportedType'; },
      preserved(draft) { return draft.customPropertyDescriptors[0].type === 'unsupportedType'; },
    },
    {
      label: '手改稿：自定义值超长', pattern: /默认值须为不超过 140/u,
      mutate(draft) { draft.customPropertyDescriptors[0].defaultValue = 'x'.repeat(141); },
      preserved(draft) { return draft.customPropertyDescriptors[0].defaultValue === 'x'.repeat(141); },
    },
  ];
  for (const test of cases) {
    const draft = JSON.parse(original);
    test.mutate(draft);
    writeFileSync(file, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
    const result = runCli(test.label, ['create-version', '--yes', ...envArgs], work, undefined, 'reject');
    assert(result.completed && !result.ok && test.pattern.test(result.output), `${test.label} 真正提交入口按字段规则拒绝`);
    assert(existsSync(file) && test.preserved(readDraft(work)), `${test.label} 用户数据仍在工作稿/待复核区`);
    assert(!existsSync(path.join(work, '.freelog', '.pending-operation.json')), `${test.label} 未产生远端提交 pending`);
    const remote = runCli(`${test.label} 核验线上无版本`, ['version', 'show', ...envArgs], work, undefined, 'reject');
    assert(remote.completed && !remote.ok && /线上还没有版本/u.test(remote.output), `${test.label} 线上仍未发行首版`);
    // 仅在全部拒绝/保留断言成立后恢复；失败现场不得自动覆盖。
    writeFileSync(file, original, 'utf8');
  }
}

function checkSystemConflicts(work, envArgs, version) {
  const descriptors = version.systemPropertyDescriptors;
  assert(Array.isArray(descriptors) && descriptors.length > 0, '线上系统属性目录非空，可据实选取只读字段');
  const raw = descriptors.filter((item) => Number(item.insertMode) !== 2 && typeof item.key === 'string');
  assert(raw.length > 0, '线上存在实际只读系统字段');
  const fields = [...new Map([raw[0], ...raw.filter((item) => item.key === 'fileSize')].map((item) => [item.key, item])).values()];
  for (const field of fields) {
    rejectWithoutDraftChange(work, envArgs, `只读系统字段 ${field.key} 禁止 set`,
      ['version', 'attr', 'set', `键=${field.key} 值=123`], /只读|没有系统附加属性/u);
  }
  const field = descriptors.find((item) => item.key === 'bundleTool') ?? raw[0];
  assert(typeof field.name === 'string' && field.name.length > 0, '系统冲突名称来自真实线上描述符');
  for (const [form, command] of [['自定义属性', 'attr'], ['可选配置', 'option']]) {
    const mode = command === 'option' ? ' 方式=文本 默认=' : ' 值=forged';
    rejectWithoutDraftChange(work, envArgs, `${form} 禁止伪装系统键`,
      ['version', command, 'add', `名称=伪装系统键 键=${field.key}${mode}`], /系统属性.*冲突/u);
    rejectWithoutDraftChange(work, envArgs, `${form} 禁止伪装系统名称`,
      ['version', command, 'add', `名称="${field.name}" 键=qaForgedSystemName${mode}`], /系统属性.*冲突/u);
  }
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

/** 在真实 JPEG 的 SOI 后写标准 COM 段生成新 SHA，不改后缀伪装、不在 EOI 后追加。 */
function writeJpegWithComment(source, destination, comment) {
  const jpeg = Buffer.from(readFileSync(source, 'utf8').trim(), 'base64');
  assert(jpeg.length > 4 && jpeg.readUInt16BE(0) === 0xffd8
    && jpeg.readUInt16BE(jpeg.length - 2) === 0xffd9, 'JPEG fixture 具有真实 SOI/EOI 标记');
  const text = Buffer.from(comment, 'utf8');
  if (text.length > 65533) throw new Error('JPEG COM 超过标准段长度');
  const segment = Buffer.alloc(4 + text.length);
  segment.writeUInt16BE(0xfffe, 0);
  segment.writeUInt16BE(text.length + 2, 2);
  text.copy(segment, 4);
  writeFileSync(destination, Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]));
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

function localFinalization(work) {
  const identity = JSON.parse(readFileSync(path.join(work, '.freelog', '1.json'), 'utf8'));
  return { draft: existsSync(path.join(work, '.freelog', '1.version.json')) ? 'present' : 'absent',
    pending: existsSync(path.join(work, '.freelog', '.pending-operation.json')) ? 'present' : 'absent',
    identity: { resourceId: identity.resourceId, typeCode: identity.typeCode, filePath: identity.filePath } };
}

function artifactObservation(work, sourcePath) {
  const file = path.join(work, sourcePath);
  const directory = statSync(file).isDirectory();
  return { sourcePath, kind: directory ? 'directory' : 'file',
    ...(directory ? {} : { sha1: createHash('sha1').update(readFileSync(file)).digest('hex') }) };
}

function retainedLocalEvidence(work) {
  return ['1.json', '1.version.json', '.pending-operation.json'].map((name) => {
    const file = path.join(work, '.freelog', name);
    if (!existsSync(file)) return { name, state: 'absent' };
    try {
      const bytes = readFileSync(file);
      return { name, state: 'present', sha256: createHash('sha256').update(bytes).digest('hex'), raw: bytes.toString('utf8') };
    } catch (error) { return { name, state: 'unreadable', reason: redact(error.message) }; }
  });
}

function checkLifecycleStage(spec, record, ids) {
  const evaluated = evaluateVersionLifecycle(spec.kind, { ...record, versions: record.readbacks });
  const previous = cases.find((item) => item.id === evaluated.id);
  const selected = evaluated.assertions.filter((item) => ids.includes(item.id));
  const assertions = [...previous.assertions.filter((item) => !ids.includes(item.id)), ...selected];
  replaceVersionLifecycleResult(cases, { ...previous, assertions, observations: evaluated.observations });
  const failed = selected.filter((item) => !item.passed);
  if (failed.length) throw new Error(`Exact lifecycle assertions failed: ${failed.map((item) => item.id).join(', ')}`);
}

function removeSuccessfulWorkspace(work) {
  cleanupWorkspace(work, { success: true, prefixes: ['freelog-theme-full-', 'freelog-image-full-', 'freelog-jpeg-full-'], log });
}

function cleanupFailedWorkspace(work) {
  log(`RETAIN 失败现场：${work}；工作稿、pending、已知隔离资源和远端状态保留，不追加远端收尾动作。`);
}

async function testResource(spec, shared) {
  const work = mkdtempSync(path.join(tmpdir(), `freelog-${spec.kind}-full-`));
  const envArgs = ['--env', env];
  const stamp = `${Date.now().toString(36)}-${spec.kind}`;
  const attrKey = `qa${spec.kind}Author`;
  const textKey = `options_qa${spec.kind}Text`;
  const selectKey = `options_qa${spec.kind}Select`;
  const state = {
    label: spec.label,
    attrKey,
    attrValue: `${spec.kind}-second`,
    textKey,
    textValue: '更新文本',
    selectKey,
    selectValue: '更新',
    selectItems: ['更新', '稳定'],
    description: `${spec.kind} 更新版描述`,
    dependency: shared.dependency,
    systemValues: spec.kind === 'theme' ? { bundleTool: 'vite', noderuntime_target_version: '0.5' } : {},
    mime: spec.mime,
  };
  let completed = false;
  const record = { kind: spec.kind, workspace: work, resourceId: null, resourceName: null, typeCode: spec.typeCode,
    cliBin, cliBinSha256: createHash('sha256').update(readFileSync(cliBin)).digest('hex'), candidateMode: process.env.FREELOG_TEST_CANDIDATE_MODE === '1',
    dependency: { resourceId: shared.dependency.resourceId, versionRange: '^1.0.0' },
    versions: [], readbacks: [], artifacts: [], local: [], actions: [], status: 'RUNNING' };
  resources.push(record);
  activeKind = spec.kind;
  activeRecord = record;
  try {
    log(`\n=== ${spec.label} ===`);
    log(`WORKSPACE ${work}`);
    requirePass(runCli('login', ['login', '--login-name', shared.primary.loginName, '--password-stdin', '--yes', ...envArgs], work, shared.primary.password), `${spec.label} 登录失败`);
    const typeInfo = runCli('type info（确认可选配置）', ['type', 'info', spec.typeCode, ...envArgs], work);
    requirePass(typeInfo, `${spec.label} type info 查询失败，未核验类型能力。`);
    const capability = classifyTypeCapability(typeInfo, spec.typeCode);
    if (capability.status === 'BLOCKED') blocked(capability.reason);
    if (capability.status !== 'PASS') throw new Error(capability.reason);

    const artifact = await spec.prepareProject(work, envArgs);
    record.artifacts.push(artifactObservation(work, artifact.initial));
    requirePass(runCli('create', [
      'create', '--title', `qa-${stamp}`, '--type', spec.typeCode, '--name', `qa-${stamp}`,
      '--artifact', artifact.initial, '--yes', ...envArgs,
    ], work), `${spec.label} 建壳失败`);
    const created = JSON.parse(readFileSync(path.join(work, '.freelog', '1.json'), 'utf8'));
    assert(typeof created.resourceId === 'string' && created.resourceId.length > 0, `${spec.label} 创建后身份已绑定真实资源 ID`);
    record.resourceId = created.resourceId;
    record.resourceName = created.resourceName ?? created.name ?? `qa-${stamp}`;
    log(`RESOURCE ${JSON.stringify({ kind: record.kind, workspace: work, resourceId: record.resourceId, resourceName: record.resourceName })}`);
    requirePass(runCli('create-version --prepare', ['create-version', '--prepare', '--yes', ...envArgs], work), `${spec.label} 首版备稿失败`);
    if (spec.kind === 'theme') {
      const attributes = runCli('attr list（主题附加字段）', ['version', 'attr', 'list', ...envArgs], work);
      requirePass(attributes, '主题附加字段展示失败');
      for (const key of Object.keys(state.systemValues)) {
        assert(attributes.output.includes(`(${key})`), `主题 attr list 列出 ${key}`);
      }
      for (const [key, value] of Object.entries(state.systemValues)) {
        requirePass(runCli(`系统 attr set ${key}`, ['version', 'attr', 'set', `键=${key} 值=${value}`, '--yes', ...envArgs], work), `主题 ${key} 设置失败`);
      }
      requirePass(runCli('系统 attr set 显式清空 target', ['version', 'attr', 'set', '键=noderuntime_target_version 值=', '--yes', ...envArgs], work), '主题 target 显式清空失败');
      assertInputAttrs(readDraft(work), { bundleTool: 'vite', noderuntime_target_version: '' }, '主题清空后');
      requirePass(runCli('系统 attr set 恢复 target', ['version', 'attr', 'set', '键=noderuntime_target_version 值=0.5', '--yes', ...envArgs], work), '主题 target 填回失败');
      assertInputAttrs(readDraft(work), state.systemValues, '主题首版');
      rejectWithoutDraftChange(work, envArgs, '系统附加字段缺少值', ['version', 'attr', 'set', '键=bundleTool'], /必须提供值/u);
      rejectWithoutDraftChange(work, envArgs, '未知系统附加字段', ['version', 'attr', 'set', '键=qaUnknownSystemAttr 值=x'], /没有系统附加属性/u);
    }
    requirePass(runCli('attr add', ['version', 'attr', 'add', `名称=验收作者 键=${attrKey} 说明=作者说明 值=${spec.kind}-first`, '--yes', ...envArgs], work), `${spec.label} 属性添加失败`);
    const beforeDependency = readFileSync(path.join(work, '.freelog', '1.version.json'));
    const addedDependency = runCli('dep add', ['version', 'dep', 'add', shared.dependency.resourceName, '--range', '^1.0.0', '--yes', '--json', ...envArgs], work);
    if (!addedDependency.ok && addedDependency.completed && addedDependency.status === 1) {
      let errorJson;
      try { errorJson = JSON.parse(addedDependency.output); } catch { /* non-JSON is an ordinary failure */ }
      if (['DEP_RANGE', 'DEP_VERSION_LIST_INVALID'].includes(errorJson?.code)) {
        assert(beforeDependency.equals(readFileSync(path.join(work, '.freelog', '1.version.json'))), '固定依赖样本不可用时原稿字节不变');
        blocked(`固定依赖样本不满足 ^1.0.0：${errorJson.code}；这是建壳后的CLI写稿前预检，保留已创建隔离壳和工程，不替换样本。`);
      }
    }
    requirePass(addedDependency, `${spec.label} 依赖声明失败`);
    requirePass(runCli('option add 空默认文本', ['version', 'option', 'add', `名称=测试文本 键=qa${spec.kind}Text 说明=文本说明 方式=文本 默认=`, '--yes', ...envArgs], work), `${spec.label} 空默认文本可选配置添加失败`);
    requirePass(runCli('option add 下拉', ['version', 'option', 'add', `名称=测试下拉 键=qa${spec.kind}Select 说明=下拉说明 方式=下拉 选项=稳定|更新`, '--yes', ...envArgs], work), `${spec.label} 下拉可选配置添加失败`);
    if (spec.kind === 'theme') rejectTamperedDrafts(work, envArgs);
    record.initialDraftBeforeSubmit = readDraft(work);
    requirePass(runCli('create-version 1.0.0', ['create-version', '--yes', ...envArgs], work), `${spec.label} 首版提交失败`);
    record.versions.push('1.0.0');
    record.local.push(localFinalization(work));
    if (existsSync(path.join(work, '.freelog', '1.version.json'))) throw new Error(`${spec.label} 首版成功后工作稿未删除`);
    const first = runCli('version show 1.0.0', ['version', 'show', '--version', '1.0.0', ...envArgs], work);
    requirePass(first, `${spec.label} 首版读回失败`);
    const firstVersion = versionJson(first.output);
    record.readbacks.push(firstVersion);
    checkLifecycleStage(spec, record, ['first-version', 'first-form', 'first-artifact', 'first-local-finalization']);

    requirePass(runCli('draft pull', ['version', 'draft', 'pull', '--yes', ...envArgs], work), `${spec.label} 更新版拉稿失败`);
    record.pulledDraft = readDraft(work);
    checkLifecycleStage(spec, record, ['pull-inheritance']);
    if (spec.kind === 'theme') {
      assertInputAttrs(readDraft(work), state.systemValues, '主题真实线上拉稿恢复');
      requirePass(runCli('拉稿后系统 attr set', ['version', 'attr', 'set', '键=bundleTool 值=vite', '--yes', ...envArgs], work), '主题拉稿后附加属性编辑失败');
      assertInputAttrs(readDraft(work), state.systemValues, '主题拉稿后重新编辑');
    }
    checkSystemConflicts(work, envArgs, firstVersion);
    requirePass(runCli('draft description', ['version', 'draft', 'description', '--description', state.description, ...envArgs], work), `${spec.label} 更新稿描述修改失败`);
    requirePass(runCli('attr set', ['version', 'attr', 'set', `键=${attrKey} 值=${state.attrValue}`, '--yes', ...envArgs], work), `${spec.label} 属性修改失败`);
    requirePass(runCli('option set 下拉', ['version', 'option', 'set', `键=${selectKey} 方式=下拉 选项=更新|稳定`, '--yes', ...envArgs], work), `${spec.label} 下拉可选配置修改失败`);
    requirePass(runCli('option set 文本', ['version', 'option', 'set', `键=${textKey} 默认=${state.textValue}`, '--yes', ...envArgs], work), `${spec.label} 文本可选配置修改失败`);
    requirePass(runCli('option add 待删除项', ['version', 'option', 'add', '名称=待删除配置 键=qaRemoveOption 方式=文本 默认=', '--yes', ...envArgs], work), `${spec.label} 临时配置添加失败`);
    requirePass(runCli('option rm 临时项', ['version', 'option', 'rm', 'options_qaRemoveOption', ...envArgs], work), `${spec.label} 临时配置删除失败`);
    requirePass(runCli('dep range', ['version', 'dep', 'range', shared.dependency.resourceId, '--range', '^1.0.0', '--yes', ...envArgs], work), `${spec.label} 依赖范围更新失败`);
    await artifact.prepareUpdate();
    record.artifacts.push(artifactObservation(work, artifact.updated));
    record.updatedDraftBeforeSubmit = readDraft(work);
    requirePass(runCli('update-version 1.1.0', ['update-version', '--version', '1.1.0', '--artifact', artifact.updated, '--yes', ...envArgs], work), `${spec.label} 更新版提交失败`);
    record.versions.push('1.1.0');
    record.local.push(localFinalization(work));
    if (existsSync(path.join(work, '.freelog', '1.version.json'))) throw new Error(`${spec.label} 更新版成功后工作稿未删除`);
    const identity = JSON.parse(readFileSync(path.join(work, '.freelog', '1.json'), 'utf8'));
    if (identity.filePath !== artifact.updated) throw new Error(`${spec.label} 更新成功后 N.json 没有回写当前产物路径`);
    const second = runCli('version show 1.1.0', ['version', 'show', '--version', '1.1.0', ...envArgs], work);
    requirePass(second, `${spec.label} 更新版读回失败`);
    const secondVersion = versionJson(second.output);
    record.readbacks.push(secondVersion);
    checkLifecycleStage(spec, record, ['updated-version', 'updated-form', 'updated-artifact', 'artifact-replacement', 'updated-local-finalization']);
    assert(!secondVersion.customPropertyDescriptors.some((item) => item.key === 'options_qaRemoveOption'), `${spec.label} 更新版不含已删除临时配置`);

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
    record.status = 'PASS_OFFLINE';
    const localAuth = path.join(work, '.freelog', 'auth');
    assert(existsSync(localAuth), `${spec.label} 只退出本临时工程登录，不回退清除全局凭据`);
    requirePass(runCli('logout（本临时工程）', ['logout', ...envArgs], work), `${spec.label} 本地登录退出失败`);
    assert(!existsSync(localAuth), `${spec.label} 本地登录选择器已删除`);
    const result = evaluateVersionLifecycle(spec.kind, { ...record, versions: record.readbacks });
    if (result.status !== 'PASS') throw new Error(result.reason);
    if (process.env.FREELOG_TEST_RUN_ID) {
      // Later browser round-trips need the actual tested build, not an invented replacement or auth/state copy.
      record.retainedArtifact = retainLifecycleArtifact({ workspace: realpathSync(work), sourcePath: artifact.updated,
        resourceKind: spec.kind, evidenceDir: realpathSync(reportDir), runId: process.env.FREELOG_TEST_RUN_ID });
    }
    removeSuccessfulWorkspace(work);
    record.cleanup = { workspace: 'removed', remoteResource: 'retained-offline' };
    replaceVersionLifecycleResult(cases, { ...result, observations: { ...record, versions: record.readbacks } });
    completed = true;
    log(`PASS ${spec.label}：模板/产物、属性、可选配置、依赖、首版、更新版、策略、上下架均已真实验证`);
  } catch (error) {
    record.status = error instanceof BlockedError ? 'BLOCKED_RETAINED' : 'FAILED_RETAINED';
    record.retainedLocal = retainedLocalEvidence(work);
    const leaf = versionLifecycleCases.find((item) => item.resourceKind === spec.kind);
    const previous = cases.find((item) => item.id === leaf.id);
    replaceVersionLifecycleResult(cases, { ...previous, status: error instanceof BlockedError ? 'BLOCKED' : 'FAIL',
      reason: redact(error instanceof Error ? error.message : String(error)), observations: { ...record, versions: record.readbacks } });
    throw error;
  } finally {
    if (!completed) {
      cleanupFailedWorkspace(work);
    }
    activeRecord = undefined;
  }
}

async function main() {
  if (env !== 'dev') blocked('本脚本只允许 --env dev。');
  if (only !== undefined && !['theme', 'image', 'jpeg'].includes(only)) {
    blocked('--only 只能是 theme、image 或 jpeg。');
  }
  try { cliBin = resolveCliBin(repoRoot); } catch (error) { blocked(error.message); }
  if (!existsSync(cliBin)) blocked('缺少 CLI 构建产物。');
  const credentialPath = path.join(testRoot, '.freelog-test-credentials.local.json');
  const poolPath = path.join(testRoot, '.freelog-test-resource-pool.local.json');
  const themeArtifact = path.join(testRoot, 'fixtures', 'theme-artifact');
  const imageV1 = path.join(testRoot, 'fixtures', 'media', 'sample-image.png');
  const imageV2 = path.join(testRoot, 'fixtures', 'media', 'sample-cover.png');
  const jpegFixture = path.join(testRoot, 'fixtures', 'media', 'sample-image-jpeg.base64');
  if (![credentialPath, poolPath, themeArtifact, imageV1, imageV2, jpegFixture].every(existsSync)) {
    blocked('缺少凭据、资源池、主题 dist、PNG 或 JPEG fixture。');
  }
  let primary;
  let dependency;
  try { primary = JSON.parse(readFileSync(credentialPath, 'utf8').replace(/^\uFEFF/u, '')).primary; }
  catch { blocked('primary 凭据文件不可解析；内容不进入报告。'); }
  try { dependency = JSON.parse(readFileSync(poolPath, 'utf8').replace(/^\uFEFF/u, '')).resources
    ?.find((item) => typeof item?.resourceName === 'string'); }
  catch { blocked('资源池文件不可解析；保持当前样本，不输出文件内容。'); }
  if (typeof primary?.loginName !== 'string' || !primary.loginName.startsWith('freelog')
    || typeof primary?.password !== 'string' || !primary.password || !dependency?.resourceId) {
    blocked('仅允许 freelog 开头的 primary 真实测试账号，且资源池依赖须有 ID 和名称。');
  }
  secrets.push(primary.password);
  if (!skipBuild) {
    const build = spawnSync('pnpm', ['--fail-if-no-match', '--filter', '@freelog-cli/cli2', 'build'], {
      cwd: repoRoot, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000,
    });
    const completed = !build.error && build.signal === null && Number.isInteger(build.status);
    log(`${completed && build.status === 0 ? 'PASS' : 'FAIL'} CLI build (exit ${build.status}, signal ${build.signal ?? 'none'})`);
    if (!completed || build.status !== 0) {
      if (build.error) log(`构建进程错误：${build.error.message}`);
      log(`${build.stdout ?? ''}${build.stderr ?? ''}`);
      throw new Error('CLI 构建失败');
    }
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
  };
  const image = {
    kind: 'image', label: 'PNG 照片 RT005001（普通单文件 → 换图）', typeCode: 'RT005001', mime: 'image/png',
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
  };
  const jpeg = {
    kind: 'jpeg', label: 'JPEG 照片 RT005001（真实 JPEG → 换图）', typeCode: 'RT005001', mime: 'image/jpeg',
    prepareProject: async (work, envArgs) => {
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      writeJpegWithComment(jpegFixture, path.join(work, 'photo-v1.jpg'), `freelog-lifecycle-v1-${stamp}`);
      writeJpegWithComment(jpegFixture, path.join(work, 'photo-v2.jpg'), `freelog-lifecycle-v2-${stamp}`);
      requirePass(runCli('init JPEG --type RT005001 --artifact photo-v1.jpg', ['init', '.', '--type', 'RT005001', '--artifact', 'photo-v1.jpg', '--yes', ...envArgs], work), 'JPEG init 失败');
      return { initial: 'photo-v1.jpg', updated: 'photo-v2.jpg', prepareUpdate: async () => undefined };
    },
  };
  for (const spec of [theme, image, jpeg]) {
    if (!only || only === spec.kind) await testResource(spec, shared);
  }
}

function saveReport(result, message = '') {
  mkdirSync(reportDir, { recursive: true });
  const summary = { result, scope: 'selected lifecycle samples only; VERSION.UPDATE_MATRIX remains unresolved',
    env, only: only ?? 'all', finishedAt: new Date().toISOString(), resources, cases,
    caseCounts: Object.fromEntries(['PASS', 'FAIL', 'BLOCKED', 'NOT_TESTED'].map((status) => [status, cases.filter((item) => item.status === status).length])),
    ...(message ? { reason: redact(message) } : {}) };
  writeFileSync(reportPath, `${lines.join('\n')}\n\n${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(reportDir, 'theme-image-full-lifecycle.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  writeSuiteCases(cases);
}

try {
  await main();
  saveReport('PASS');
  log(`报告: ${reportPath}`);
} catch (error) {
  const result = error instanceof BlockedError ? 'BLOCKED' : 'FAIL';
  const message = redact(error instanceof Error ? error.message : String(error));
  if (!activeKind) {
    const leaf = versionLifecycleCases.find((item) => !only || item.resourceKind === only);
    if (leaf) replaceVersionLifecycleResult(cases, { id: leaf.id, status: result, assertions: [], reason: message });
  }
  saveReport(result, message);
  console.error(redact(`${result}: ${message}`));
  console.error(redact(`报告: ${reportPath}`));
  process.exitCode = error instanceof BlockedError ? 3 : 1;
}
