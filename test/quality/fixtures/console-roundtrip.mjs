/** Entirely synthetic observations for the checker; the dev producer never imports this file. */
import { createHash } from 'node:crypto';
import path from 'node:path';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const plain = (value) => JSON.parse(JSON.stringify(value));

/** Synthetic AX/control packets exercise the parser; never imported by a real browser producer. */
export function syntheticBrowserCapture(request, visible) {
  const header = `1 AXWebArea Synthetic Console, URL: ${request.url}`;
  let number = 2;
  const line = (role, value) => `${number++} ${role}${value === '' ? '' : ` ${value}`}`;
  const main = [header, line('text', `版本 ${visible.version}`), line('text', visible.filename), line('text', `ID ：${visible.fileSha1}`), line('text', '属性'),
    ...(request.resourceKind === 'theme' ? ['大小 535b', 'MIME类型 application/zip'] : ['宽度 882', '高度 562', 'MIME类型 image/png', '大小 2.69kb']).map((text) => line('text', text)),
    ...visible.systemAdditional.map(({ key, value }) => line('text', `${key === 'bundleTool' ? '打包工具' : '目标版本'} ${value}`)),
    line('text', `验收作者 ${visible.customPropertyDescriptors[0].defaultValue}`), line('text', '可选配置'),
    line('text', '测试文本'), ...(visible.customPropertyDescriptors[1].defaultValue === '' ? [] : [line('text', visible.customPropertyDescriptors[1].defaultValue)]), line('text', '配置方式：输入框'),
    line('text', '测试下拉'), line('text', visible.customPropertyDescriptors[2].candidateItems.join(' | ')), line('text', '配置方式：下拉选择器'),
    line('text', '依赖声明'), ...['资源', '指示：', '未授权', '已授权', '已上抛'].map((text) => line('text', text)), line('text', visible.dependencies[0].title),
    line('text', `${visible.dependencies[0].owner} ｜图片 / 照片 ｜版本范围：${visible.dependencies[0].versionRange} 未获得授权`),
    line('text', '描述'), line('button', visible.descriptionText === '' ? '添加描述' : '编辑'),
    ...(visible.descriptionText === '' ? [line('text', '描述最近更新的内容，以及所有在展示或使用此资源时所需要了解的信息。')] : [line('text', visible.descriptionText)]), line('text', '相关视图')].join('\n');
  const input = (placeholder, value, disabled = false) => ({ tag: 'INPUT', placeholder, disabled, contenteditable: null, value, text: '' });
  const frames = [];
  const add = (kind, ax = main, inputs = []) => {
    const start = Date.parse(request.requestedAt) + frames.length * 20 + 1;
    const wrapped = `Browser tab: 1, Title: "Synthetic Console", URL: "${request.url}".\n${ax}\n\nThe focused UI element is ${header}`;
    frames.push({ kind, startedAt: new Date(start).toISOString(), finishedAt: new Date(start + 10).toISOString(), axBefore: wrapped, axAfter: wrapped, inputs });
  };
  add('main');
  const withTooltip = (name, key, remark, editable = false) => {
    const text = `名称 ${name} 键 ${key}${remark ? ` 说明 ${remark}` : ''}`;
    const row = main.match(new RegExp(`^\\d+ text ${name} .+$`, 'mu'))[0];
    return main.replace(row, `${row}\n${line('container', `${text}${editable ? ' 编辑' : ''}, ID: :synthetic:`)}\n\t${line('container', '')}\n\t\t${line('text', text)}${editable ? `\n\t\t${line('button', '编辑')}` : ''}`);
  };
  const author = visible.customPropertyDescriptors[0];
  add('author', withTooltip(author.name, author.key, author.remark, true));
  for (const [index, kind] of [[1, 'text-option'], [2, 'select-option']]) {
    const value = visible.customPropertyDescriptors[index];
    const keySuffix = value.key.slice('options_'.length);
    add(kind, `${main}\n${line('heading', '编辑可选配置, Value: 2')}\n${line('text', '名称')}\n${line('text field', `(disabled) ${value.name}`)}\n${line('text', '键')}\n${line('container', '')}\n${line('text', 'options_')}\n${line('text field', `(disabled) ${keySuffix}`)}\n${line('text', '说明')}\n${kind === 'select-option' ? line('text', '（默认选中首个选项）') : ''}`,
      [input('输入名称', value.name, true), input('输入键，键是此条目的唯一标识符', keySuffix, true), input('输入说明', value.remark),
        ...(index === 1 ? [input('输入默认值', value.defaultValue)] : value.candidateItems.map((item) => input('输入选项', item)))]);
  }
  if (request.resourceKind === 'theme') {
    add('system-target', withTooltip('目标版本', 'noderuntime_target_version', '目标运行时'));
    add('system-tool', withTooltip('打包工具', 'bundleTool', ''));
  }
  if (visible.descriptionText === '') add('empty-description', main.replace(/^\d+ button 添加描述$/mu,
    [line('button', '取消'), line('button', '保存'), ...['加粗', '斜体', '下划线', '媒体', '引用', '代码', '无序列表', '有序列表',
      '常规 标题', '颜色', '链接', '(disabled) 清除链接', '全屏'].flatMap((label) => [line('button', label),
      ...(label === '常规 标题' ? ['常规', '标题'] : [label.replace('(disabled) ', '')]).map((text) => line('text', text))]),
    line('text entry area', '(settable) ')].join('\n')).replace(/^\d+ text 描述最近更新的内容，以及所有在展示或使用此资源时所需要了解的信息。\n/mu, ''),
    [{ tag: 'DIV', placeholder: null, disabled: false, contenteditable: 'true', value: '', text: '' }]);
  return { schemaVersion: 2, ...Object.fromEntries(['runId', 'nonce', 'cliBin', 'binSha256', 'resourceId', 'resourceKind', 'version', 'stage'].map((key) => [key, request[key]])),
    status: 'OBSERVED', finishedAt: new Date(Date.parse(request.requestedAt) + 1000).toISOString(), frames };
}
function form(kind, updated) {
  return [
    { key: `qa${kind}Author`, name: '验收作者', type: 'readonlyText', defaultValue: `${kind}-${updated ? 'second' : 'first'}`, remark: '作者说明', candidateItems: [] },
    { key: `options_qa${kind}Text`, name: '测试文本', type: 'editableText', defaultValue: updated ? '更新文本' : '', remark: '文本说明', candidateItems: [] },
    { key: `options_qa${kind}Select`, name: '测试下拉', type: 'select', defaultValue: updated ? '更新' : '稳定', remark: '下拉说明', candidateItems: updated ? ['更新', '稳定'] : ['稳定', '更新'] },
  ];
}
export function consoleLifecycleFixture(kind = 'theme') {
  const resourceId = (kind === 'theme' ? 'a' : 'b').repeat(24);
  const dependency = { resourceId: 'd'.repeat(24), versionRange: '^1.0.0' };
  const typeCode = kind === 'theme' ? 'RT001' : 'RT005001';
  const system = kind === 'theme' ? { bundleTool: 'vite', noderuntime_target_version: '0.5' } : {};
  const mime = kind === 'theme' ? 'application/zip' : 'image/png';
  const versions = [false, true].map((updated) => ({ resourceId, resourceTypeCode: typeCode, version: updated ? '1.1.0' : '1.0.0',
    fileSha1: (updated ? '2' : '1').repeat(40), filename: kind === 'theme' ? `freelog-zip-${updated ? '2' : '1'}-synthetic.zip` : `photo-v${updated ? '2' : '1'}.png`,
    description: updated ? `${kind} 更新版描述` : '', customPropertyDescriptors: form(kind, updated), dependencies: [dependency],
    systemPropertyDescriptors: [{ key: 'mime', insertMode: 1, valueDisplay: mime }, ...Object.entries(system).map(([key, valueDisplay]) => ({ key, insertMode: 2, valueDisplay }))],
    versionProperty: { mime, ...Object.fromEntries(form(kind, updated).map((item) => [item.key, item.defaultValue])), ...system } }));
  const paths = kind === 'theme' ? ['dist', 'dist'] : ['photo-v1.png', 'photo-v2.png'];
  return { kind, candidateMode: true, resourceId, typeCode, resourceName: `freelog-synthetic/qa-synthetic-${kind}`, dependency, versions,
    cliBin: path.resolve('synthetic-install/node_modules/@freelog-cli/cli2/dist/bin/index.js'), cliBinSha256: 'f'.repeat(64),
    local: paths.map((filePath) => ({ draft: 'absent', pending: 'absent', identity: { resourceId, typeCode, filePath } })),
    artifacts: paths.map((sourcePath, index) => ({ sourcePath, kind: kind === 'theme' ? 'directory' : 'file', ...(kind === 'theme' ? {} : { sha1: versions[index].fileSha1 }) })),
    pulledDraft: { draftKind: 'update', fromVersion: '1.0.0', resourceId, resourceTypeCode: typeCode, fileSha1: versions[0].fileSha1, filename: versions[0].filename,
      description: '', customPropertyDescriptors: form(kind, false), dependencies: [dependency], inputAttrs: Object.entries(system).map(([key, value]) => ({ key, value })),
      orphanedInputAttrs: [], baseUpcastResources: [], authExcludedItems: [] },
    actions: [kind === 'theme' ? ['init theme --template vite-react-ts', ['init', 'theme', '.', '--template', 'vite-react-ts', '--yes', '--env', 'dev']]
      : ['init --type RT005001 --artifact photo-v1.png', ['init', '.', '--type', 'RT005001', '--artifact', 'photo-v1.png', '--yes', '--env', 'dev']],
    ['create', ['create', '--title', `qa-synthetic-${kind}`, '--type', typeCode, '--name', `qa-synthetic-${kind}`, '--artifact', paths[0], '--yes', '--env', 'dev']],
    ['create-version --prepare', ['create-version', '--prepare', '--yes', '--env', 'dev']], ['create-version 1.0.0', ['create-version', '--yes', '--env', 'dev']],
    ['version show 1.0.0', ['version', 'show', '--version', '1.0.0', '--env', 'dev'], JSON.stringify(versions[0])],
    ['draft pull', ['version', 'draft', 'pull', '--yes', '--env', 'dev']],
    ['update-version 1.1.0', ['update-version', '--version', '1.1.0', '--artifact', paths[1], '--yes', '--env', 'dev']],
    ['version show 1.1.0', ['version', 'show', '--version', '1.1.0', '--env', 'dev'], JSON.stringify(versions[1])],
    ].map(([label, argv, stdout = '']) => ({ label, argv, expectedExit: 0, process: { exitCode: 0, signal: null, error: null, timedOut: false }, stdout, stderr: '' })) };
}

export async function consoleRoundtripFixture(kind = 'theme') {
  const helpers = await import('../../acceptance/console-roundtrip-evidence.mjs');
  const { evaluateVersionLifecycle } = await import('../../acceptance/version-lifecycle-evidence.mjs');
  const lifecycle = consoleLifecycleFixture(kind);
  const runId = 'synthetic-console-run';
  const evidenceDir = path.resolve('synthetic-evidence');
  lifecycle.retainedArtifact = { runId, resourceKind: kind, sourcePath: kind === 'theme' ? 'dist' : 'photo-v2.png', kind: kind === 'theme' ? 'directory' : 'file',
    copyPath: path.join(evidenceDir, 'lifecycle-artifacts', kind, kind === 'theme' ? 'dist' : 'photo-v2.png'),
    manifest: [{ path: kind === 'theme' ? 'index.html' : '.', kind: 'file', size: 12, sha256: 'a'.repeat(64) }] };
  const evaluated = evaluateVersionLifecycle(kind, lifecycle);
  const rawText = `${JSON.stringify({ schemaVersion: 1, runId, caseId: evaluated.id, assertions: evaluated.assertions, observations: lifecycle }, null, 2)}\n`;
  const rawFile = path.join(evidenceDir, `verify-theme-image-full-lifecycle.mjs.json.${evaluated.id.replaceAll('.', '_')}.evidence.json`);
  const prerequisite = { runId, suiteFile: path.join(evidenceDir, 'verify-theme-image-full-lifecycle.mjs.json'), rawFile, rawSha256: sha256(rawText), rawText,
    suiteCase: { id: evaluated.id, status: 'PASS', assertions: evaluated.assertions, evidenceRef: { runId, path: rawFile, sha256: sha256(rawText) } } };
  const observed = { runId, evidenceDir, cliBin: lifecycle.cliBin, binSha256: lifecycle.cliBinSha256, resourceKind: kind, resourceId: lifecycle.resourceId,
    startedAt: '2026-10-17T04:00:00.000Z', deadlineAt: '2026-10-17T04:20:00.000Z',
    ownerIdentity: { currentUser: { ret: 0, errCode: 0, data: { userId: 12345, username: 'freelog-synthetic' } },
      resource: { ret: 0, errCode: 0, data: { resourceId: lifecycle.resourceId, resourceName: lifecycle.resourceName, userId: 12345 } } },
    prerequisite, dependencyIdentity: { resourceId: lifecycle.dependency.resourceId, resourceName: 'freelog-synthetic/dependency', resourceTitle: '合成依赖标题',
      raw: { ret: 0, errCode: 0, data: { resourceId: lifecycle.dependency.resourceId, resourceName: 'freelog-synthetic/dependency', resourceTitle: '合成依赖标题' } } }, browser: [], sdkStages: [] };
  const stages = ['view-first', 'view-updated', 'edit-description', 'edit-text-option'];
  let version = helpers.consoleVersionProjection(lifecycle.versions[0]);
  for (const [index, stage] of stages.entries()) {
    const before = plain(stage === 'view-first' ? version : index === 1 ? helpers.consoleVersionProjection(lifecycle.versions[1]) : version);
    version = helpers.expectedConsoleStageVersion(kind, stage, lifecycle.versions);
    const request = helpers.consoleCaptureRequest({ ...observed, stage, nonce: String(index + 1).repeat(32), requestedAt: new Date(Date.UTC(2026, 9, 17, 4, index)).toISOString() });
    const visible = helpers.consoleVisibleProjection(version, observed.dependencyIdentity);
    const capture = syntheticBrowserCapture(request, visible);
    const base = `console-roundtrip-${runId}-${kind}-${stage}-${request.nonce}`;
    observed.browser.push({ requestFile: path.join(evidenceDir, `${base}.request.json`), captureFile: path.join(evidenceDir, `${base}.capture.json`), request, capture });
    observed.sdkStages.push({ stage, before: helpers.consoleSdkObservation(before), after: helpers.consoleSdkObservation(version) });
  }
  const finalVersion = helpers.expectedConsolePublishedVersion(kind, lifecycle.versions, { fileSha1: (kind === 'theme' ? '3' : '2').repeat(40), filename: kind === 'theme' ? 'freelog-zip-3-synthetic.zip' : 'photo-v2.png' });
  const commands = helpers.consoleReverseCommands(kind, lifecycle.resourceId);
  observed.reverse = { cwd: path.resolve(`synthetic-freelog-console-${kind}`), artifact: { path: kind === 'theme' ? 'dist' : 'photo-v2.png', kind: kind === 'theme' ? 'directory' : 'file',
    manifest: lifecycle.retainedArtifact.manifest, sha1: kind === 'theme' ? null : '2'.repeat(40) },
    actions: commands.map(({ label, argv }) => ({ label, argv, result: { status: 0, signal: null, error: null, timedOut: false, stderr: '', stdout: label === 'version show 1.2.0' ? JSON.stringify(finalVersion) : 'success' } })),
    boundIdentity: { schemaVersion: 1, subject: 'resource', env: 'dev', resourceId: lifecycle.resourceId, typeCode: lifecycle.typeCode, filePath: kind === 'theme' ? 'dist' : 'photo-v2.png', resourceName: lifecycle.resourceName },
    pulledDraft: helpers.consoleDraftProjection(helpers.expectedConsoleDraft(kind, version)),
    beforeSubmitDraft: helpers.consoleDraftProjection(helpers.expectedConsoleDraft(kind, helpers.expectedConsoleEditedVersion(kind, lifecycle.versions))),
    cliReadback: finalVersion, sdkReadback: helpers.consoleSdkObservation(finalVersion),
    oldVersionAfter: helpers.consoleSdkObservation(version), firstVersionAfter: helpers.consoleSdkObservation(helpers.consoleVersionProjection(lifecycle.versions[0])),
    finalization: { draft: 'absent', pending: 'absent', identity: { resourceId: lifecycle.resourceId, typeCode: lifecycle.typeCode, filePath: kind === 'theme' ? 'dist' : 'photo-v2.png' } } };
  return observed;
}
