import { CliError } from '../../../core/errors';
import { confirmWrite } from '../../../core/tty';
import { readDraft, writeDraft } from '../../../local/draft';
import { resolveIdentity } from '../../../local/resolve';
import { assertKeyUnchanged, assertValidKey, parseLine } from './parseLine';
import { previewLine } from './preview';

const MAX_OPTION = 30;

function isOption(item: Record<string, unknown>): boolean {
  return item.type === 'editableText' || item.type === 'select';
}

function typeAllowsOption(typeCode: string, support?: boolean): boolean {
  if (support === false) {
    return false;
  }
  if (support === true) {
    return true;
  }
  return typeCode === 'RT001' || typeCode === 'RT002';
}

function optionListFromDraft(draft: { customPropertyDescriptors?: Record<string, unknown>[] }) {
  return (draft.customPropertyDescriptors ?? []).filter((item) => isOption(item));
}

export async function optionAdd(cwd: string, input: {
  line?: string;
  file?: string;
  yes?: boolean;
  supportOptionalConfig?: boolean;
}): Promise<string> {
  const identity = resolveIdentity(cwd, input.file);
  if (!typeAllowsOption(identity.typeCode, input.supportOptionalConfig)) {
    // i18n: cli.option.unsupported
    throw new CliError('当前类型不支持可选配置', 'OPTION_UNSUPPORTED');
  }
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

  const mode = parsed.mode ?? '';
  const isSelect = mode === '下拉' || mode === '下拉列表' || mode === 'select';
  const isText = mode === '文本' || mode === '文本输入框' || mode === 'input' || mode === '';
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
  if (isSelect) {
    const options = (parsed.options ?? '').split('|').map((item) => item.trim()).filter(Boolean);
    if (options.length === 0 || options.length > 30) {
      // i18n: cli.option.options_count
      throw new CliError('选项个数不能超过30项', 'OPTION_OPTIONS');
    }
    type = 'select';
    defaultValue = options[0] ?? '';
    candidateItems = options;
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

export async function optionSet(cwd: string, input: {
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
  if (parsed.name) {
    found.name = parsed.name;
  }
  if (parsed.defaultValue !== undefined || parsed.value !== undefined) {
    found.defaultValue = parsed.defaultValue ?? parsed.value ?? '';
  }
  const preview = await confirmWrite(previewLine(parsed), input.yes);
  writeDraft(cwd, identity.n, draft);
  return preview;
}

export function optionRm(cwd: string, key: string, file?: string): string {
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

export function optionList(cwd: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  return optionListFromDraft(draft ?? {})
    .map((item) => `${item.key}=${item.defaultValue ?? ''} ${item.name ?? ''}`)
    .join('\n');
}
