/** Design-bound observations for three real lifecycle chains; this is not the whole update matrix. */
import { isDeepStrictEqual } from 'node:util';

const design = 'docs/一期/产品方案/脚手架设计';
const assertionIds = Object.freeze(['commands-completed', 'raw-readback-binding', 'first-version', 'first-form', 'first-artifact',
  'first-local-finalization', 'pull-inheritance', 'updated-version', 'updated-form', 'updated-artifact',
  'artifact-replacement', 'updated-local-finalization']);
const definitions = [
  { kind: 'theme', id: 'VERSION.LIFECYCLE.THEME_DIRECTORY', title: 'RT001 directory first release and updated full form', typeCode: 'RT001', mime: 'application/zip', paths: ['dist', 'dist'],
    inputClass: 'theme initialized from vite-react-ts; built directory contents change before explicit 1.1.0 update' },
  { kind: 'image', id: 'VERSION.LIFECYCLE.PNG_REPLACEMENT', title: 'RT005001 PNG first release and replacement with updated full form', typeCode: 'RT005001', mime: 'image/png', paths: ['photo-v1.png', 'photo-v2.png'],
    inputClass: 'ordinary true PNG file; another true PNG file replaces it for explicit 1.1.0 update' },
  { kind: 'jpeg', id: 'VERSION.LIFECYCLE.JPEG_REPLACEMENT', title: 'RT005001 JPEG first release and replacement with updated full form', typeCode: 'RT005001', mime: 'image/jpeg', paths: ['photo-v1.jpg', 'photo-v2.jpg'],
    inputClass: 'ordinary true JPEG file with standard COM segment; another true JPEG replaces it for explicit 1.1.0 update' },
];

export const versionLifecycleCases = Object.freeze(definitions.map((item) => Object.freeze({
  ...item, parentRule: 'VERSION.UPDATE_MATRIX', kind: 'product-case', resourceKind: item.kind,
  required: true, script: 'verify-theme-image-full-lifecycle.mjs', layer: 'real-dev-cli/candidate-installed-bin-required-for-candidate-evidence', assertionIds,
  preconditions: Object.freeze(['Use dev and the authorized primary account; candidate evidence requires its fixed installed bin. Direct workspace runs only prove their own development sample.',
    'Use a new owned temporary project and newly created resource; the selected pool dependency is read-only.',
    'The exact selected dependency must have a published version matching ^1.0.0; otherwise BLOCKED without replacing the sample.',
    'The actual leaf type must currently support optional configuration; template and real media fixtures must exist.']),
  action: Object.freeze(['Initialize the type-specific project and artifact, create an isolated resource and prepare the initial draft.',
    'Add named custom attribute with remark, empty text option with remark, ordered select option with remark and exact dependency declaration.',
    'For theme explicitly set bundleTool=vite and noderuntime_target_version=0.5; publish and read 1.0.0.',
    'Pull 1.0.0 and read the full inherited draft before edits; edit values, select order and description, replace/change artifact, publish and read 1.1.0.',
    'Read draft/pending absence and identity artifact path after both submissions; retain raw command output and DTOs.']),
  forbiddenSideEffects: Object.freeze(['prod request', 'pool resource mutation', 'contract signing or payment',
    'deleting remote resources', 'deleting failed/pending drafts or projects', 'automatic retry of unknown submissions']),
  designRefs: Object.freeze([
    { path: `${design}/COMMANDS.md`, section: '3.1–3.4 版本' },
    { path: `${design}/ARCHITECTURE/05-版本工作稿与独立命令.md`, section: '2.1 拉线上某一号盖进缓存 / 4. 提交' },
    { path: `${design}/ARCHITECTURE/06-发行物与压缩.md`, section: '2. 什么时候打 zip / 3.1 发版怎么定路径' },
    { path: `${design}/PHASE/单资源/更新版本/01-更新版本.md`, section: '1.2 写入哪些字段 / 4.2 按已确认的本地路径 / 6. 提交' },
    { path: `${design}/PHASE/单资源/版本表单/01-属性.md`, section: '1. 三种属性 / 2. 系统附加 / 3.5 提交映射' },
    { path: `${design}/PHASE/单资源/版本表单/02-可选配置.md`, section: '2.5 文本 / 2.6 下拉 / 5. 提交映射' },
    { path: `${design}/PHASE/单资源/版本表单/03-依赖.md`, section: '1.3 版本范围 / 3. 提交 / 4. 更新版本' },
    { path: 'docs/一期/产品方案/业务梳理/字段级校验对照表.md', section: '2. 自定义属性 / 3. 可选配置 / 4. 依赖' },
  ].map(Object.freeze)),
  technicalMapping: Object.freeze({ readApi: 'Resource.resourceVersionInfo1',
    readDto: 'Console db7181ff0206a387138200b6c17ab24c0f737526 packages/console/src/models/resourceVersionCreatorPage.ts:555-573',
    observedReadShape: 'Historical 2026-10-15 E2/E3 theme/PNG/JPEG JSON readbacks (six versions per run): non-select candidateItems are []; reference only, not current candidate evidence.',
    additionalValue: 'systemPropertyDescriptors[].valueDisplay, not the inputAttrs write DTO or an attribute-definition default',
    artifact: 'Top-level fileSha1/filename; direct files compare local bytes, directory uploads compare generated zip shape and SHA change.' }),
  expected: Object.freeze({ versions: Object.freeze(['1.0.0', '1.1.0']), dependencyRange: '^1.0.0',
    firstDescription: '', updatedDescription: `${item.kind} 更新版描述`, successfulDraftState: 'absent', successfulPendingState: 'absent' }),
})));

function definition(kind) {
  const found = definitions.find((item) => item.kind === kind);
  if (!found) throw new Error(`Unknown version lifecycle kind: ${kind}`);
  return found;
}

export function initialVersionLifecycleCases(only) {
  return versionLifecycleCases.map((item) => ({ id: item.id, status: 'NOT_TESTED', assertions: [],
    reason: only && item.resourceKind !== only ? `Excluded by --only ${only}; no chain was executed.` : 'This chain has not executed in this run.' }));
}

export function replaceVersionLifecycleResult(cases, result) {
  const index = cases.findIndex((item) => item.id === result.id);
  if (index < 0) throw new Error(`Unknown version lifecycle result: ${result.id}`);
  cases[index] = result;
}

function expectedForm(kind, updated) {
  return [
    { key: `qa${kind}Author`, name: '验收作者', type: 'readonlyText', defaultValue: `${kind}-${updated ? 'second' : 'first'}`, remark: '作者说明', candidateItems: [] },
    { key: `options_qa${kind}Text`, name: '测试文本', type: 'editableText', defaultValue: updated ? '更新文本' : '', remark: '文本说明', candidateItems: [] },
    { key: `options_qa${kind}Select`, name: '测试下拉', type: 'select', defaultValue: updated ? '更新' : '稳定', remark: '下拉说明', candidateItems: updated ? ['更新', '稳定'] : ['稳定', '更新'] },
  ].sort((a, b) => a.key.localeCompare(b.key));
}

function descriptors(value) {
  if (!Array.isArray(value)) return null;
  return value.map((item) => Object.fromEntries(['key', 'name', 'type', 'defaultValue', 'remark', 'candidateItems']
    .map((key) => [key, item?.[key] ?? null]))).sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function dependencies(value) {
  return Array.isArray(value) ? value.map((item) => ({ resourceId: item?.resourceId ?? null, versionRange: item?.versionRange ?? null })) : null;
}

function additionalValues(kind) {
  return kind === 'theme' ? { bundleTool: 'vite', noderuntime_target_version: '0.5' } : {};
}

function formEvidence(kind, version, resourceId, updated) {
  const form = expectedForm(kind, updated);
  const system = additionalValues(kind);
  return {
    expected: { customPropertyDescriptors: form, dependencies: [{ resourceId, versionRange: '^1.0.0' }],
      description: updated ? `${kind} 更新版描述` : '',
      systemAdditional: Object.entries(system).map(([key, value]) => ({ key, insertMode: 2, valueDisplay: value })),
      versionProperty: { ...Object.fromEntries(form.map((item) => [item.key, item.defaultValue])), ...system } },
    actual: { customPropertyDescriptors: descriptors(version?.customPropertyDescriptors), dependencies: dependencies(version?.dependencies), description: version?.description ?? null,
      systemAdditional: Array.isArray(version?.systemPropertyDescriptors) ? version.systemPropertyDescriptors
        .filter((item) => Object.hasOwn(system, item?.key)).map((item) => ({ key: item.key, insertMode: item.insertMode, valueDisplay: item.valueDisplay }))
        .sort((a, b) => a.key.localeCompare(b.key)) : null,
      versionProperty: Object.fromEntries([...form.map((item) => item.key), ...Object.keys(system)].map((key) => [key, version?.versionProperty?.[key] ?? null])) },
  };
}

function artifactEvidence(spec, version, artifact, index) {
  const directory = spec.kind === 'theme';
  const filename = version?.filename;
  const validName = typeof filename === 'string' && /^freelog-zip-[^/\\]+\.zip$/u.test(filename);
  const mimeDescriptors = Array.isArray(version?.systemPropertyDescriptors) ? version.systemPropertyDescriptors.filter((item) => item?.key === 'mime') : null;
  const sha = version?.fileSha1;
  return {
    expected: { source: { sourcePath: spec.paths[index], kind: directory ? 'directory' : 'file' },
      filename: directory ? { shape: 'temporary-zip-basename', prefix: 'freelog-zip-', extension: '.zip' } : spec.paths[index],
      sha1: directory ? { format: 'lowercase-hex', length: 40 } : artifact?.sha1 ?? null,
      mimeDescriptors: [{ key: 'mime', insertMode: 1, valueDisplay: spec.mime }], mimeProperty: spec.mime },
    actual: { source: { sourcePath: artifact?.sourcePath ?? null, kind: artifact?.kind ?? null },
      filename: directory ? validName ? { shape: 'temporary-zip-basename', prefix: 'freelog-zip-', extension: '.zip' } : { invalidFilename: filename ?? null } : filename ?? null,
      sha1: directory ? { format: typeof sha === 'string' && /^[a-f0-9]{40}$/u.test(sha) ? 'lowercase-hex' : 'invalid', length: typeof sha === 'string' ? sha.length : null } : sha ?? null,
      mimeDescriptors: Array.isArray(mimeDescriptors) ? mimeDescriptors.map(({ key, insertMode, valueDisplay }) => ({ key, insertMode, valueDisplay })) : null,
      mimeProperty: version?.versionProperty?.mime ?? null },
  };
}

/** Required success actions cannot redefine their expected exit or stand in for another command. */
function requiredCommands(spec, actions) {
  const create = actions.find((item) => item?.label === 'create');
  const title = create?.argv?.[2];
  const isolatedName = typeof title === 'string' && /^qa-[a-z0-9]+-(?:theme|image|jpeg)$/u.test(title)
    ? title : '<valid-isolated-resource-name>';
  const env = ['--env', 'dev'];
  return [
    spec.kind === 'theme'
      ? ['init theme --template vite-react-ts', ['init', 'theme', '.', '--template', 'vite-react-ts', '--yes', ...env]]
      : [spec.kind === 'image' ? 'init --type RT005001 --artifact photo-v1.png' : 'init JPEG --type RT005001 --artifact photo-v1.jpg',
        ['init', '.', '--type', spec.typeCode, '--artifact', spec.paths[0], '--yes', ...env]],
    ['create', ['create', '--title', isolatedName, '--type', spec.typeCode, '--name', isolatedName, '--artifact', spec.paths[0], '--yes', ...env]],
    ['create-version --prepare', ['create-version', '--prepare', '--yes', ...env]],
    ['create-version 1.0.0', ['create-version', '--yes', ...env]],
    ['version show 1.0.0', ['version', 'show', '--version', '1.0.0', ...env]],
    ['draft pull', ['version', 'draft', 'pull', '--yes', ...env]],
    ['update-version 1.1.0', ['update-version', '--version', '1.1.0', '--artifact', spec.paths[1], '--yes', ...env]],
    ['version show 1.1.0', ['version', 'show', '--version', '1.1.0', ...env]],
  ].map(([label, argv]) => ({ label, argv, expectedExit: 0, process: { exitCode: 0, signal: null, error: null, timedOut: false } }));
}

function rawVersion(actions, label) {
  const matching = actions.filter((item) => item?.label === label);
  if (matching.length !== 1 || typeof matching[0].stdout !== 'string') return null;
  // version show may prefix the JSON with the documented draft notice; never use stderr as a DTO.
  const output = matching[0].stdout;
  const start = output.indexOf('{');
  if (start < 0) return null;
  try {
    const value = JSON.parse(output.slice(start));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

/** Only checks observable DTO/local/process contracts; does not import or simulate CLI business code. */
export function evaluateVersionLifecycle(kind, observations) {
  const spec = definition(kind);
  const leaf = versionLifecycleCases.find((item) => item.resourceKind === kind);
  const assertions = [];
  const check = (id, expected, actual) => assertions.push({ id, passed: isDeepStrictEqual(expected, actual), expected, actual });
  const actions = Array.isArray(observations.actions) ? observations.actions : [];
  const requiredActions = requiredCommands(spec, actions);
  check('commands-completed', { requiredActions, failedActions: [] }, {
    requiredActions: actions.filter((item) => requiredActions.some((required) => required.label === item?.label))
      .map((item) => ({ label: item.label, argv: item.argv ?? null, expectedExit: item.expectedExit ?? null, process: item.process ?? null })),
    failedActions: actions.filter((item) => ![0, 1].includes(item?.expectedExit) || item?.process?.exitCode !== item.expectedExit
      || item?.process?.signal !== null || item?.process?.error !== null || item?.process?.timedOut !== false)
      .map((item) => ({ label: item?.label ?? null, expectedExit: item?.expectedExit ?? null, process: item?.process ?? null })),
  });
  check('raw-readback-binding', [0, 1].map((index) => observations.versions?.[index] ?? null),
    ['version show 1.0.0', 'version show 1.1.0'].map((label) => rawVersion(actions, label)));
  for (const [index, updated] of [false, true].entries()) {
    const prefix = updated ? 'updated' : 'first';
    const version = observations.versions?.[index];
    check(`${prefix}-version`, { resourceId: observations.resourceId, resourceTypeCode: spec.typeCode, version: updated ? '1.1.0' : '1.0.0' },
      { resourceId: version?.resourceId ?? null, resourceTypeCode: version?.resourceTypeCode ?? null, version: version?.version ?? null });
    const form = formEvidence(kind, version, observations.dependency?.resourceId, updated);
    check(`${prefix}-form`, form.expected, form.actual);
    const artifact = artifactEvidence(spec, version, observations.artifacts?.[index], index);
    check(`${prefix}-artifact`, artifact.expected, artifact.actual);
    check(`${prefix}-local-finalization`, { draft: 'absent', pending: 'absent', identity: { resourceId: observations.resourceId, typeCode: spec.typeCode, filePath: spec.paths[index] } }, observations.local?.[index] ?? null);
  }
  const first = observations.versions?.[0];
  const draft = observations.pulledDraft;
  const expectedInherited = { draftKind: 'update', fromVersion: '1.0.0', resourceId: observations.resourceId, resourceTypeCode: spec.typeCode,
    fileSha1: first?.fileSha1 ?? null, filename: first?.filename ?? null, description: '', customPropertyDescriptors: expectedForm(kind, false),
    dependencies: [{ resourceId: observations.dependency?.resourceId, versionRange: '^1.0.0' }], inputAttrs: Object.entries(additionalValues(kind)).map(([key, value]) => ({ key, value })),
    orphanedInputAttrs: [], baseUpcastResources: [], authExcludedItems: [] };
  check('pull-inheritance', expectedInherited, { ...Object.fromEntries(['draftKind', 'fromVersion', 'resourceId', 'resourceTypeCode', 'fileSha1', 'filename', 'description', 'orphanedInputAttrs', 'baseUpcastResources', 'authExcludedItems']
    .map((key) => [key, draft?.[key] ?? null])), customPropertyDescriptors: descriptors(draft?.customPropertyDescriptors), dependencies: dependencies(draft?.dependencies),
    inputAttrs: Array.isArray(draft?.inputAttrs) ? draft.inputAttrs.map((item) => ({ key: item?.key ?? null, value: item?.value ?? null })).sort((a, b) => String(a.key).localeCompare(String(b.key))) : null });
  const shas = Array.isArray(observations.versions) ? observations.versions.map((item) => item?.fileSha1) : [];
  check('artifact-replacement', { sha1Formats: ['lowercase-hex-40', 'lowercase-hex-40'], relationship: 'different' }, {
    sha1Formats: [0, 1].map((index) => typeof shas?.[index] === 'string' && /^[a-f0-9]{40}$/u.test(shas[index]) ? 'lowercase-hex-40' : 'invalid'),
    relationship: shas?.[0] !== shas?.[1] ? 'different' : 'same',
  });
  const failed = assertions.filter((item) => !item.passed);
  return { id: leaf.id, status: failed.length ? 'FAIL' : 'PASS', assertions, observations,
    ...(failed.length ? { reason: `Exact lifecycle assertions failed: ${failed.map((item) => item.id).join(', ')}` } : {}) };
}
