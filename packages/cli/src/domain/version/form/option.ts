/**
 * 可选配置表单：仅 supportOptionalConfig===2 的类型可用。
 * 文本方式不带选项；下拉方式默认取第一项；条目 ≤30；键不可改。
 */

import { CliError } from '../../../core/errors';
import { confirmWrite } from '../../../core/tty';
import { readDraft, writeDraft } from '../../../local/draft';
import { resolveIdentity } from '../../../local/resolve';
import { withProjectLock } from '../../../local/lock';
import { requireAuth } from '../../account/login';
import { getTypeInfo, type TypeApis } from '../../create/typePick';
import { assertKeyUnchanged, assertValidKey, parseLine } from './parseLine';
import { previewLine } from './preview';

const MAX_OPTION = 30;
const MAX_OPTION_ITEM = 30;
const MAX_TEXT_DEFAULT = 140;
const MAX_NAME = 50;
const MAX_REMARK = 50;

/** 名称 ≤50（对照 Console fResourceOptionEditorDrawer alert_naming_convention_attribute_name）。 */
function assertValidName(name: string): void {
  if (name.length > MAX_NAME) {
    // i18n: alert_naming_convention_attribute_name
    throw new CliError('名称不能超过50个字符', 'OPTION_NAME_LONG');
  }
}

/** 说明 ≤50（对照 Console alert_key_remark_length）。 */
function assertValidRemark(remark: string): void {
  if (remark.length > MAX_REMARK) {
    // i18n: alert_key_remark_length
    throw new CliError('不能超过50个字符。', 'OPTION_REMARK_LONG');
  }
}

/** 选项值 / 文本默认值 ≤140（对照 Console「不超过140个字符」硬编码）。 */
function assertOptionValueLength(value: string): void {
  if (value.length > MAX_TEXT_DEFAULT) {
    // i18n: cli.option.value_too_long
    throw new CliError('不超过140个字符', 'OPTION_VALUE_LONG');
  }
}

function isOption(item: Record<string, unknown>): boolean {
  return item.type === 'editableText' || item.type === 'select';
}

async function assertTypeAllowsOption(input: {
  cwd: string;
  typeCode: string;
  supportOptionalConfig?: boolean;
  homeDir?: string;
  apis?: TypeApis;
}): Promise<void> {
  if (input.supportOptionalConfig === true) return;
  if (input.supportOptionalConfig === false) {
    throw new CliError('当前类型不支持可选配置', 'OPTION_UNSUPPORTED');
  }
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const type = await getTypeInfo(input.typeCode, input.apis);
  if (type.supportOptionalConfig !== 2) {
    throw new CliError('当前类型不支持可选配置', 'OPTION_UNSUPPORTED');
  }
}

function optionListFromDraft(draft: { customPropertyDescriptors?: Record<string, unknown>[] }) {
  return (draft.customPropertyDescriptors ?? []).filter((item) => isOption(item));
}

function normalizeMode(mode: string | undefined): 'editableText' | 'select' | undefined {
  if (mode === undefined) return undefined;
  if (mode === '下拉' || mode === '下拉列表' || mode === 'select') return 'select';
  if (mode === '文本' || mode === '文本输入框' || mode === 'input') return 'editableText';
  throw new CliError('方式只能是文本或下拉', 'OPTION_MODE');
}

function parseCandidates(raw: string | undefined): string[] {
  const items = (raw ?? '').split('|').map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) throw new CliError('下拉至少需要 1 个选项', 'OPTION_OPTIONS');
  if (items.length > MAX_OPTION_ITEM) throw new CliError('选项个数不能超过30项', 'OPTION_OPTIONS');
  for (const item of items) assertOptionValueLength(item);
  if (items.some((item, index) => items.indexOf(item) !== index)) {
    throw new CliError('该选项已存在', 'OPTION_DUPLICATE_OPTION');
  }
  return items;
}

/** 加可选配置：类型门禁 + 行校验（方式=文本/下拉、下拉默认取第一项）→ 确认写稿。 */
export async function optionAdd(cwd: string, input: {
  line?: string;
  file?: string;
  yes?: boolean;
  supportOptionalConfig?: boolean;
  homeDir?: string;
  apis?: TypeApis;
}): Promise<string> {
  return withProjectLock(cwd, () => optionAddLocked(cwd, input), 'version-option-add');
}

async function optionAddLocked(cwd: string, input: {
  line?: string;
  file?: string;
  yes?: boolean;
  supportOptionalConfig?: boolean;
  homeDir?: string;
  apis?: TypeApis;
}): Promise<string> {
  const identity = resolveIdentity(cwd, input.file);
  await assertTypeAllowsOption({ cwd, typeCode: identity.typeCode, ...input });
  const draft = readDraft(cwd, identity.n) ?? {
    baseUpcastResources: [] as [],
    authExcludedItems: [] as [],
  };
  const parsed = parseLine(input.line ?? '');
  if (!parsed.name || !parsed.key) {
    // i18n: cli.option.name_key_required
    throw new CliError('可选配置需要名称和键', 'OPTION_FIELDS');
  }
  assertValidKey(parsed.key);
  const list = draft.customPropertyDescriptors ?? [];
  if (optionListFromDraft(draft).length >= MAX_OPTION) {
    // i18n: cli.option.full
    throw new CliError('最多可添加30个可选配置', 'OPTION_FULL');
  }
  if (list.some((item) => item.key === parsed.key)) {
    // i18n: cli.option.duplicate
    throw new CliError(`键 ${parsed.key} 已存在`, 'OPTION_DUPLICATE');
  }
  if (list.some((item) => item.name === parsed.name)) {
    // i18n: alert_key_name_exist
    throw new CliError('名称已存在', 'OPTION_NAME_DUPLICATE');
  }

  const normalizedMode = normalizeMode(parsed.mode);
  if (!normalizedMode) {
    throw new CliError('方式只能是文本或下拉', 'OPTION_MODE');
  }
  const isSelect = normalizedMode === 'select';
  const isText = normalizedMode === 'editableText';
  if (isSelect && parsed.defaultValue) {
    // i18n: cli.option.select_default
    throw new CliError('下拉默认值固定为第一项，请把要默认的选项放在第一位', 'OPTION_SELECT_DEFAULT');
  }
  if (isText && parsed.options) {
    // i18n: cli.option.text_options
    throw new CliError('文本方式不要写选项', 'OPTION_TEXT_OPTIONS');
  }
  if (!isSelect && !isText) {
    // i18n: cli.option.mode_invalid
    throw new CliError('方式只能是文本或下拉', 'OPTION_MODE');
  }

  let type = 'editableText';
  let defaultValue = parsed.defaultValue ?? parsed.value ?? '';
  let candidateItems: string[] | undefined;
  assertValidName(parsed.name);
  assertValidRemark(parsed.remark ?? '');
  if (isSelect) {
    const options = parseCandidates(parsed.options);
    type = 'select';
    defaultValue = options[0] ?? '';
    candidateItems = options;
  } else {
    assertOptionValueLength(defaultValue);
  }

  const preview = await confirmWrite(previewLine(parsed), input.yes);
  list.push({
    name: parsed.name,
    key: parsed.key,
    remark: parsed.remark ?? '',
    defaultValue,
    type,
    ...(candidateItems ? { candidateItems } : {}),
  });
  draft.customPropertyDescriptors = list;
  writeDraft(cwd, identity.n, draft);
  return preview;
}

/** 改可选配置：键不可改；一行式可改方式和整份候选项，select 默认始终是第一项。 */
export async function optionSet(cwd: string, input: {
  line?: string;
  file?: string;
  yes?: boolean;
}): Promise<string> {
  return withProjectLock(cwd, () => optionSetLocked(cwd, input), 'version-option-set');
}

async function optionSetLocked(cwd: string, input: {
  line?: string;
  file?: string;
  yes?: boolean;
}): Promise<string> {
  const identity = resolveIdentity(cwd, input.file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    // i18n: cli.draft.missing
    throw new CliError('没有工作稿，请先 version draft pull', 'DRAFT_MISSING');
  }
  const parsed = parseLine(input.line ?? '');
  const found = (draft.customPropertyDescriptors ?? []).find(
    (item) => isOption(item) && (item.key === parsed.key || item.name === parsed.name),
  );
  if (!found) {
    // i18n: cli.option.not_found
    throw new CliError('找不到这条可选配置', 'OPTION_NOT_FOUND');
  }
  assertKeyUnchanged(String(found.key), parsed.key);
  assertValidName(parsed.name ?? String(found.name ?? ''));
  assertValidRemark(parsed.remark ?? String(found.remark ?? ''));
  const nextType = normalizeMode(parsed.mode) ?? (String(found.type) === 'select' ? 'select' : 'editableText');
  const nextDefault = parsed.defaultValue ?? parsed.value;
  if (nextType === 'select' && nextDefault !== undefined) {
    throw new CliError('下拉默认值固定为第一项，请把要默认的选项放在第一位', 'OPTION_SELECT_DEFAULT');
  }
  if (nextType === 'editableText') {
    if (parsed.options !== undefined) {
      throw new CliError('文本方式不要写选项', 'OPTION_TEXT_OPTIONS');
    }
    if (nextDefault !== undefined) assertOptionValueLength(nextDefault);
  }
  if (parsed.name && (draft.customPropertyDescriptors ?? []).some((item) => item.name === parsed.name && item.key !== found.key)) {
    // i18n: alert_key_name_exist
    throw new CliError('名称已存在', 'OPTION_NAME_DUPLICATE');
  }
  if (parsed.name) {
    found.name = parsed.name;
  }
  if (parsed.remark !== undefined) {
    found.remark = parsed.remark;
  }
  if (nextType === 'select') {
    const candidates = parsed.options !== undefined
      ? parseCandidates(parsed.options)
      : Array.isArray(found.candidateItems) ? found.candidateItems.map(String) : [];
    if (candidates.length === 0) {
      throw new CliError('下拉至少需要 1 个选项', 'OPTION_OPTIONS');
    }
    found.type = 'select';
    found.candidateItems = candidates;
    found.defaultValue = candidates[0]!;
  } else {
    found.type = 'editableText';
    delete found.candidateItems;
    if (nextDefault !== undefined) {
      found.defaultValue = nextDefault;
    }
  }
  const preview = await confirmWrite(previewLine(parsed), input.yes);
  writeDraft(cwd, identity.n, draft);
  return preview;
}

/** 删可选配置；自定义属性不受影响，找不到报错。 */
export function optionRm(cwd: string, key: string, file?: string): string {
  return withProjectLock(cwd, () => optionRmLocked(cwd, key, file), 'version-option-rm');
}

function optionRmLocked(cwd: string, key: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    // i18n: cli.draft.missing
    throw new CliError('没有工作稿，请先 version draft pull', 'DRAFT_MISSING');
  }
  const list = draft.customPropertyDescriptors ?? [];
  const next = list.filter((item) => !(isOption(item) && item.key === key));
  if (next.length === list.length) {
    // i18n: cli.option.not_found
    throw new CliError('找不到这条可选配置', 'OPTION_NOT_FOUND');
  }
  draft.customPropertyDescriptors = next;
  writeDraft(cwd, identity.n, draft);
  return key;
}

/** 列可选配置（key=默认值 名称）。 */
export function optionList(cwd: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  return optionListFromDraft(draft ?? {})
    .map((item) => `${item.key}=${item.defaultValue ?? ''} ${item.name ?? ''}`)
    .join('\n');
}
