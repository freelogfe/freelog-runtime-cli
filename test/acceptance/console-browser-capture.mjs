/** Current published theme/PNG test profile. This is not a general browser driver. */
import { isDeepStrictEqual } from 'node:util';

/**
 * Self-contained so its exact function source can run in cua_repl with the existing tab.
 * Reads only; the operator reveals controls separately. No expected values or overrides.
 */
export function createConsoleBrowserRecorder(request, tab) {
  const fail = () => { throw new Error('Console browser recorder rejected the request or observation.'); };
  const identityKeys = ['runId', 'nonce', 'cliBin', 'binSha256', 'resourceId', 'resourceKind', 'version', 'stage'];
  const identity = Object.fromEntries(identityKeys.map((key) => [key, request?.[key]]));
  const target = request?.url;
  const requestedAt = request?.requestedAt, expiresAt = request?.expiresAt;
  if (!['theme', 'image'].includes(identity.resourceKind)
    || !['view-first', 'view-updated', 'edit-description', 'edit-text-option'].includes(identity.stage)
    || !/^[a-f0-9]{24}$/u.test(identity.resourceId ?? '')
    || target !== `https://console.devfreelog.com/resource/sidebar/versionInfo/${identity.resourceId}?version=${identity.version}`
    || !/^[a-f0-9]{32}$/u.test(identity.nonce ?? '') || !/^[a-f0-9]{64}$/u.test(identity.binSha256 ?? '')
    || typeof identity.runId !== 'string' || !identity.runId || typeof identity.cliBin !== 'string' || !identity.cliBin
    || !Number.isFinite(Date.parse(requestedAt)) || !Number.isFinite(Date.parse(expiresAt))) fail();
  const frameKinds = ['main', 'author', 'text-option', 'select-option', 'system-target', 'system-tool', 'empty-description'];
  const frames = [];
  let busy = false;
  let closed = false;
  const clock = () => new Date().toISOString();
  const checkTime = (at) => {
    if (Date.parse(at) < Date.parse(requestedAt) || Date.parse(at) > Date.parse(expiresAt)) fail();
  };
  const checkPage = (ax) => {
    if (typeof ax !== 'string' || !ax.trim() || ax.length > 2_000_000) fail();
    const match = ax.match(/^\s*\d+ AXWebArea[^\n]*, URL: (\S+)\s*$/mu);
    const url = match && (/^https:\/\//u.test(match[1]) ? match[1] : `https://${match[1]}`);
    const versions = [...ax.matchAll(/^\s*\d+ text 版本 (.+)$/gmu)];
    if (url !== target || versions.length !== 1 || versions[0][1] !== identity.version) fail();
  };
  return Object.freeze({
    async frame(kind) {
      if (arguments.length !== 1 || closed || busy || !frameKinds.includes(kind) || frames.some((entry) => entry.kind === kind)) fail();
      busy = true;
      try {
        const startedAt = clock(); checkTime(startedAt);
        const axBefore = await tab.getAXState({ disableDiffing: true, emit: false }); checkPage(axBefore);
        let inputs = [];
        if (['text-option', 'select-option', 'empty-description'].includes(kind)) {
          // Scope before reading values: never collect global search or authentication inputs.
          inputs = await tab.playwright.getByRole('textbox').evaluateAll((elements) => elements.filter((element) =>
            ['输入名称', '输入键，键是此条目的唯一标识符', '输入说明', '输入默认值', '输入选项'].includes(element.getAttribute('placeholder'))
              || element.getAttribute('contenteditable') === 'true').map((element) => ({
            tag: element.tagName, placeholder: element.getAttribute('placeholder'), disabled: element.disabled === true,
            contenteditable: element.getAttribute('contenteditable'), value: typeof element.value === 'string' ? element.value : null,
            text: element.textContent,
          })));
        }
        const axAfter = await tab.getAXState({ disableDiffing: true, emit: false }); checkPage(axAfter);
        const finishedAt = clock(); checkTime(finishedAt);
        if (finishedAt < startedAt) fail();
        frames.push({ kind, startedAt, finishedAt, axBefore, axAfter, inputs });
        if (new TextEncoder().encode(JSON.stringify(frames)).length > 4_990_000) fail();
        return { kind, startedAt, finishedAt };
      } catch {
        // An interrupted read has no resumable half-frame. Do not quietly reuse the recorder.
        closed = true;
        fail();
      } finally { busy = false; }
    },
    finish() {
      if (arguments.length || busy || closed || !frames.length) fail();
      const finishedAt = clock(); checkTime(finishedAt); closed = true;
      const json = JSON.stringify({ schemaVersion: 2, ...identity, status: 'OBSERVED', finishedAt, frames });
      if (new TextEncoder().encode(json).length > 5_000_000) fail();
      return JSON.parse(json);
    },
  });
}

const identityKeys = ['runId', 'nonce', 'cliBin', 'binSha256', 'resourceId', 'resourceKind', 'version', 'stage'];
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value, keys) => plain(value) && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
const fail = () => { throw new Error('Console browser raw capture is incomplete or inconsistent with its fixed profile.'); };
function pageUrl(ax) {
  if (typeof ax !== 'string' || !ax.trim() || ax.length > 2_000_000) fail();
  const match = ax.match(/^\s*\d+ AXWebArea[^\n]*, URL: (\S+)\s*$/mu);
  if (!match) fail();
  return /^https:\/\//u.test(match[1]) ? match[1] : `https://${match[1]}`;
}
function texts(ax) { return ax.split('\n').flatMap((line) => { const match = line.match(/^\s*\d+ text (?!field|entry area)(.*)$/u); return match ? [match[1]] : []; }); }
function one(values) { if (values.length !== 1) fail(); return values[0]; }
/** Keep original node positions until the fixed sections and allowed roles are checked. */
function pageParts(ax, meta = null, requireTooltip = false) {
  const lines = ax.split('\n').filter((line) => line.trim());
  const envelope = lines.shift()?.match(/^Browser tab: \d+, Title: ".*", URL: "(https:\/\/[^"\s]+)"\.$/u);
  const focus = lines.pop()?.match(/^The focused UI element is (\d+) (.+)$/u);
  if (!envelope || envelope[1] !== pageUrl(ax) || !focus || !lines.some((line) => line.trim() === `${focus[1]} ${focus[2]}`)) fail();
  let positioned = lines.map((line) => {
    const match = line.match(/^(\s*)\d+ (.+)$/u);
    if (!match) fail();
    return { depth: match[1].replaceAll('\t', '    ').length, tail: match[2] };
  });
  const tips = positioned.flatMap((node, index) => node.tail.startsWith('container 名称 ') ? [index] : []);
  if (tips.length > 1 || (tips.length && !meta) || (requireTooltip && !tips.length)) fail();
  if (tips.length) {
    const start = tips[0], root = positioned[start], anchor = positioned[start - 1];
    const tipText = `名称 ${meta.name} 键 ${meta.key}${meta.remark ? ` 说明 ${meta.remark}` : ''}`;
    const suffix = root.tail.slice(`container ${tipText}`.length);
    if (!root.tail.startsWith(`container ${tipText}`) || !/^(?: 编辑)?, ID: \S+$/u.test(suffix)
      || anchor?.depth !== root.depth || !anchor.tail.startsWith(`text ${meta.name} `)) fail();
    let end = start + 1;
    while (end < positioned.length && positioned[end].depth > root.depth) end += 1;
    const content = positioned.slice(start + 1, end).map((node) => node.tail).filter((tail) => tail !== 'container');
    if (!isDeepStrictEqual(content, [`text ${tipText}`, ...(suffix.startsWith(' 编辑') ? ['button 编辑'] : [])])) fail();
    const attributesAt = one(positioned.flatMap((node, index) => node.tail === 'text 属性' ? [index] : []));
    const optionsAt = one(positioned.flatMap((node, index) => node.tail === 'text 可选配置' ? [index] : []));
    if (!(attributesAt < start && start < end && end <= optionsAt)) fail();
    positioned = positioned.filter((_, index) => index < start || index >= end);
  }
  const nodes = positioned.map((node) => node.tail);
  const headings = ['属性', '可选配置', '依赖声明', '描述', '相关视图'];
  const boundaries = headings.map((name) => one(nodes.flatMap((node, index) => node === `text ${name}` ? [index] : [])));
  if (boundaries.some((index, order) => order > 0 && index <= boundaries[order - 1])) fail();
  const sections = Object.fromEntries(headings.slice(0, -1).map((name, index) => [name, nodes.slice(boundaries[index] + 1, boundaries[index + 1])]));
  const header = nodes.slice(0, boundaries[0]);
  const shaIndex = one(header.flatMap((node, index) => /^text ID ：[a-f0-9]{40}$/u.test(node) ? [index] : []));
  const filename = header[shaIndex - 1]?.match(/^text (.+)$/u)?.[1];
  if (!filename || filename.includes('/') || filename.includes('\\')) fail();
  return { sections, filename, fileSha1: header[shaIndex].slice('text ID ：'.length) };
}
const icon = (value) => /^[\uE000-\uF8FF\s]+$/u.test(value);
/** Ignore only known decoration, never an unknown semantic node. */
function sectionTexts(nodes, { buttons = false, images = false, dependencyRoot = false } = {}) {
  return nodes.flatMap((node, index) => {
    if (node === 'container' || (dependencyRoot && node === 'container app-dd' && index === nodes.length - 1)
      || (images && node === 'image')) return [];
    if (buttons && node.startsWith('button ') && icon(node.slice('button '.length))) return [];
    if (!node.startsWith('text ') || /^text (field|entry area)/u.test(node)) fail();
    const text = node.slice(5);
    return buttons && icon(text) ? [] : [text];
  });
}
function attributeRows(parts, kind) {
  const rows = sectionTexts(parts.sections['属性']);
  const size = /^大小 \d+(?:\.\d+)?(?:b|kb|mb|gb)$/u;
  const basic = kind === 'theme' ? [size, /^MIME类型 application\/zip$/u]
    : [/^宽度 [1-9]\d*$/u, /^高度 [1-9]\d*$/u, /^MIME类型 image\/png$/u, size];
  if (rows.length !== 5 || basic.some((pattern, index) => !pattern.test(rows[index]))) fail();
  if (kind === 'theme' && !isDeepStrictEqual(rows.slice(2, 4).map((row) => row.split(' ')[0]).sort(), ['打包工具', '目标版本'])) fail();
  if (!/^验收作者 .+$/u.test(rows[4])) fail();
  return rows;
}
function description(parts) {
  const nodes = parts.sections['描述'];
  const buttons = nodes.filter((node) => node.startsWith('button '));
  const button = one(buttons);
  if (button !== 'button 添加描述' && button !== 'button 编辑') fail();
  const rows = nodes.flatMap((node) => {
    if (node === button || node === 'container') return [];
    if (!node.startsWith('text ') || /^text (field|entry area)/u.test(node)) fail();
    return [node.slice(5)];
  });
  if (button === 'button 添加描述') {
    if (!isDeepStrictEqual(rows, ['描述最近更新的内容，以及所有在展示或使用此资源时所需要了解的信息。'])) fail();
    return '';
  }
  if (!rows.length || rows.some((row) => !row)) fail();
  return rows.join('\n');
}
/** Current blank Braft toolbar only; unknown content is not hidden by an empty DIV. */
function emptyDescriptionEditor(nodes) {
  const buttons = [], labels = [];
  let entries = 0;
  const toolbarLabel = (value) => value.replace(/[\uE000-\uF8FF]/gu, '').replace(/ +/gu, ' ').trim();
  for (const node of nodes) {
    if (node === 'container') continue;
    if (/^text entry area \(settable\)[ \t]*$/u.test(node)) { entries += 1; continue; }
    if (node.startsWith('button ')) { buttons.push(toolbarLabel(node.slice(7))); continue; }
    if (!node.startsWith('text ') || /^text (field|entry area)/u.test(node)) fail();
    if (!icon(node.slice(5))) labels.push(toolbarLabel(node.slice(5)));
  }
  const controls = ['加粗', '斜体', '下划线', '媒体', '引用', '代码', '无序列表', '有序列表'];
  if (entries !== 1 || !isDeepStrictEqual(buttons, ['取消', '保存', ...controls, '常规 标题', '颜色', '链接', '(disabled) 清除链接', '全屏'])
    || !isDeepStrictEqual(labels, [...controls, '常规', '标题', '颜色', '链接', '清除链接', '全屏'])) fail();
}
function tooltip(frame) {
  const parsed = texts(frame.axAfter).flatMap((text) => {
    const match = text.match(/^名称 (.+?) 键 ([A-Za-z][A-Za-z0-9_]*)(?: 说明 (.*))?$/u);
    return match ? [{ name: match[1], key: match[2], remark: match[3] ?? '' }] : [];
  });
  return one(parsed);
}
function formInput(frame, placeholder, disabled) {
  const element = one(frame.inputs.filter((entry) => entry.placeholder === placeholder));
  if (!['INPUT', 'TEXTAREA'].includes(element.tag) || element.contenteditable !== null
    || element.disabled !== disabled || typeof element.value !== 'string' || element.text !== '') fail();
  return element.value;
}
function option(frame, kind, select) {
  const label = select ? '测试下拉' : '测试文本';
  const key = formInput(frame, '输入键，键是此条目的唯一标识符', true);
  const name = formInput(frame, '输入名称', true);
  if (key !== `qa${kind}${select ? 'Select' : 'Text'}` || name !== label) fail();
  for (const ax of [frame.axBefore, frame.axAfter]) {
    const disabledValues = [...ax.matchAll(/^\s*\d+ text field \(disabled\) (.*)$/gmu)].map((match) => match[1]);
    if (!/^\s*\d+ heading 编辑可选配置,/mu.test(ax) || !disabledValues.includes(key) || !disabledValues.includes(name)) fail();
  }
  const remark = formInput(frame, '输入说明', false);
  const options = frame.inputs.filter((entry) => entry.placeholder === '输入选项');
  if (select) {
    if (frame.inputs.length !== 3 + options.length || options.length < 1
      || !texts(frame.axAfter).includes('（默认选中首个选项）')
      || options.some((entry) => !['INPUT', 'TEXTAREA'].includes(entry.tag) || entry.disabled || entry.contenteditable !== null
        || typeof entry.value !== 'string' || entry.text !== '')) fail();
    const candidateItems = options.map((entry) => entry.value);
    return { key, name, type: '下拉列表', defaultValue: candidateItems[0], remark, candidateItems };
  }
  if (frame.inputs.length !== 4 || options.length) fail();
  return { key, name, type: '文本输入框', defaultValue: formInput(frame, '输入默认值', false), remark };
}
function flatten(value, prefix = '') {
  if (Array.isArray(value)) return value.length ? value.flatMap((entry, index) => flatten(entry, `${prefix}[${index}]`)) : [{ field: prefix, value: [] }];
  if (plain(value)) return Object.entries(value).flatMap(([key, entry]) => flatten(entry, prefix ? `${prefix}.${key}` : key));
  return [{ field: prefix, value }];
}

/** Derive values from tool frames only. No caller-authored visible/readings/time is accepted. */
export function projectConsoleBrowserCapture(request, capture) {
  if (!keysAre(capture, ['schemaVersion', ...identityKeys, 'status', 'finishedAt', 'frames']) || capture.schemaVersion !== 2
    || capture.status !== 'OBSERVED' || identityKeys.some((key) => capture[key] !== request[key])
    || !Array.isArray(capture.frames) || !capture.frames.length || capture.frames.length > 7
    || new TextEncoder().encode(JSON.stringify(capture)).length > 5_000_000) fail();
  const requested = Date.parse(request.requestedAt), expires = Date.parse(request.expiresAt), finished = Date.parse(capture.finishedAt);
  if (![requested, expires, finished].every(Number.isFinite) || finished < requested || finished > expires) fail();
  let previous = requested;
  const frames = new Map();
  for (const frame of capture.frames) {
    if (!keysAre(frame, ['kind', 'startedAt', 'finishedAt', 'axBefore', 'axAfter', 'inputs']) || frames.has(frame.kind)
      || !['main', 'author', 'text-option', 'select-option', 'system-target', 'system-tool', 'empty-description'].includes(frame.kind)
      || pageUrl(frame.axBefore) !== request.url || pageUrl(frame.axAfter) !== request.url
      || !Array.isArray(frame.inputs) || frame.inputs.length > 100) fail();
    const start = Date.parse(frame.startedAt), end = Date.parse(frame.finishedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < previous || end < start || end > finished) fail();
    for (const ax of [frame.axBefore, frame.axAfter]) {
      const versions = [...ax.matchAll(/^\s*\d+ text 版本 (.+)$/gmu)];
      if (versions.length !== 1 || versions[0][1] !== request.version) fail();
    }
    if (frame.inputs.some((entry) => !keysAre(entry, ['tag', 'placeholder', 'disabled', 'contenteditable', 'value', 'text'])
      || typeof entry.tag !== 'string' || !(entry.placeholder === null || typeof entry.placeholder === 'string')
      || typeof entry.disabled !== 'boolean' || !(entry.contenteditable === null || typeof entry.contenteditable === 'string')
      || !(entry.value === null || typeof entry.value === 'string') || typeof entry.text !== 'string')) fail();
    if (!['text-option', 'select-option', 'empty-description'].includes(frame.kind) && frame.inputs.length) fail();
    previous = end; frames.set(frame.kind, frame);
  }
  const frame = (kind) => { if (!frames.has(kind)) fail(); return frames.get(kind); };
  const main = frame('main');
  if (/heading 编辑可选配置|text entry area/mu.test(main.axAfter)) fail();
  const rows = texts(main.axAfter);
  const version = one(rows.filter((text) => /^版本 /u.test(text))).slice('版本 '.length);
  if (version !== request.version) fail();
  const parts = pageParts(main.axAfter);
  const { fileSha1, filename } = parts;
  const attributes = attributeRows(parts, request.resourceKind);
  const rowValue = (name) => one(attributes.filter((text) => text.startsWith(`${name} `))).slice(name.length + 1);
  const author = tooltip(frame('author'));
  if (author.name !== '验收作者' || author.key !== `qa${request.resourceKind}Author`) fail();
  const customPropertyDescriptors = [
    { key: author.key, name: author.name, type: '自定义属性', defaultValue: rowValue(author.name), remark: author.remark },
    option(frame('text-option'), request.resourceKind, false), option(frame('select-option'), request.resourceKind, true),
  ];
  const optionSection = sectionTexts(parts.sections['可选配置'], { buttons: true, dependencyRoot: true });
  const textOption = customPropertyDescriptors[1], selectOption = customPropertyDescriptors[2];
  const expectedOptions = [textOption.name, ...(textOption.defaultValue === '' ? [] : [textOption.defaultValue]), '配置方式：输入框',
    selectOption.name, selectOption.candidateItems.join(' | '), '配置方式：下拉选择器'];
  if (!isDeepStrictEqual(optionSection, expectedOptions)) fail();
  const dependencySection = sectionTexts(parts.sections['依赖声明'], { buttons: true, images: true });
  const additionalRows = [];
  const metadata = new Map([['author', author]]);
  if (request.resourceKind === 'theme') {
    for (const [name, key] of [['system-target', 'noderuntime_target_version'], ['system-tool', 'bundleTool']]) {
      const meta = tooltip(frame(name)); if (meta.key !== key) fail();
      metadata.set(name, meta); additionalRows.push({ key, name: meta.name, value: rowValue(meta.name) });
    }
  } else if (frames.has('system-target') || frames.has('system-tool')) fail();
  const descriptionText = description(parts);
  // Tooltip subtrees are consumed only after matching their actual attribute-row anchor.
  // All other before/after page fields must remain the complete same profile.
  for (const entry of capture.frames) for (const key of ['axBefore', 'axAfter']) {
    const meta = metadata.get(entry.kind);
    const current = pageParts(entry[key], meta, Boolean(meta) && key === 'axAfter');
    if (current.filename !== filename || current.fileSha1 !== fileSha1
      || !isDeepStrictEqual(attributeRows(current, request.resourceKind), attributes)
      || !isDeepStrictEqual(sectionTexts(current.sections['可选配置'], { buttons: true, dependencyRoot: true }), optionSection)
      || !isDeepStrictEqual(sectionTexts(current.sections['依赖声明'], { buttons: true, images: true }), dependencySection)
      || (entry.kind !== 'empty-description' && description(current) !== descriptionText)) fail();
  }
  const systemAdditional = additionalRows.sort((a, b) => attributes.indexOf(`${a.name} ${a.value}`) - attributes.indexOf(`${b.name} ${b.value}`)).map(({ key, value }) => ({ key, value }));
  if (descriptionText === '') {
    const empty = frame('empty-description');
    if (empty.inputs.length !== 1 || empty.inputs[0].contenteditable !== 'true' || empty.inputs[0].tag !== 'DIV'
      || empty.inputs[0].placeholder !== null || empty.inputs[0].disabled || empty.inputs[0].text !== ''
      || ![null, ''].includes(empty.inputs[0].value)) fail();
    for (const ax of [empty.axBefore, empty.axAfter]) {
      const editor = pageParts(ax).sections['描述'];
      emptyDescriptionEditor(editor);
    }
  } else if (frames.has('empty-description')) fail();
  if (dependencySection.length !== 7 || !isDeepStrictEqual(dependencySection.slice(0, 5), ['资源', '指示：', '未授权', '已授权', '已上抛'])) fail();
  const owner = dependencySection[6].match(/^([^｜]+) ｜[^｜]+ ｜版本范围：(\S+) (?:未获得授权|已获得授权)$/u);
  if (!owner || !dependencySection[5]) fail();
  const visible = { resourceId: request.resourceId, version, fileSha1, filename, descriptionText, customPropertyDescriptors,
    systemAdditional, dependencies: [{ title: dependencySection[5], owner: owner[1], versionRange: owner[2] }] };
  const allowed = new Set(['main', 'author', 'text-option', 'select-option', ...(request.resourceKind === 'theme' ? ['system-target', 'system-tool'] : []), ...(descriptionText === '' ? ['empty-description'] : [])]);
  if (allowed.size !== frames.size || [...frames.keys()].some((key) => !allowed.has(key))) fail();
  const readings = flatten(visible).map((entry) => {
    let frameKind = 'main', source = 'ax-text', rule;
    if (entry.field === 'resourceId') source = 'ax-url';
    if (entry.field === 'descriptionText' && descriptionText === '') { frameKind = 'empty-description'; source = 'contenteditable'; }
    if (/^customPropertyDescriptors\[0\]\.(key|name|remark)$/u.test(entry.field)) frameKind = 'author';
    if (/^customPropertyDescriptors\[[12]\]/u.test(entry.field)) { frameKind = entry.field.startsWith('customPropertyDescriptors[1]') ? 'text-option' : 'select-option'; source = 'input'; }
    if (entry.field.endsWith('.type')) { source = 'derived'; rule = entry.field.includes('[0]') ? 'attribute-section' : 'configuration-control-shape'; }
    if (entry.field === 'customPropertyDescriptors[2].defaultValue') { source = 'derived'; rule = 'first-option-with-visible-hint'; }
    if (entry.field === 'systemAdditional') { source = 'derived'; rule = 'confirmed-RT005001-test-profile-no-additional-fields'; }
    const systemKey = entry.field.match(/^systemAdditional\[(\d+)\]\.key$/u);
    if (systemKey) frameKind = systemAdditional[Number(systemKey[1])].key === 'bundleTool' ? 'system-tool' : 'system-target';
    return { ...entry, source, frame: frameKind, ...(rule ? { rule } : {}) };
  });
  return { actualUrl: pageUrl(main.axAfter), observedAt: capture.finishedAt, visible, readings };
}
