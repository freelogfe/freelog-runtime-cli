import { CliError } from '../../../core/errors';
import { confirmWrite } from '../../../core/tty';
import { readDraft, writeDraft } from '../../../local/draft';
import { resolveIdentity } from '../../../local/resolve';
import { assertKeyUnchanged, assertValidKey, parseLine } from './parseLine';
import { previewLine } from './preview';

const MAX_CUSTOM = 30;
const MAX_VALUE = 100;

function isCustom(item: Record<string, unknown>): boolean {
  return item.type !== 'editableText' && item.type !== 'select';
}

export async function attrAdd(cwd: string, input: {
  line?: string;
  file?: string;
  yes?: boolean;
}): Promise<string> {
  const identity = resolveIdentity(cwd, input.file);
  const draft = readDraft(cwd, identity.n) ?? {
    baseUpcastResources: [] as [],
    authExcludedItems: [] as [],
  };
  const parsed = parseLine(input.line ?? '');
  if (!parsed.name || !parsed.key) {
    // i18n: cli.attr.name_key_required
    throw new CliError('自定义属性需要名称和键', 'ATTR_FIELDS');
  }
  assertValidKey(parsed.key);
  if (parsed.value !== undefined && parsed.value.length > MAX_VALUE) {
    // i18n: cli.attr.value_too_long
    throw new CliError('自定义属性值最长 100', 'ATTR_VALUE_LONG');
  }
  const list = draft.customPropertyDescriptors ?? [];
  const custom = list.filter((item) => isCustom(item) && item.type !== 'select');
  if (custom.length >= MAX_CUSTOM) {
    // i18n: cli.attr.full
    throw new CliError('最多可添加30个属性', 'ATTR_FULL');
  }
  if (list.some((item) => item.key === parsed.key)) {
    // i18n: cli.attr.duplicate
    throw new CliError(`键 ${parsed.key} 已存在`, 'ATTR_DUPLICATE');
  }
  const preview = await confirmWrite(previewLine(parsed), input.yes);
  list.push({
    name: parsed.name,
    key: parsed.key,
    remark: parsed.remark ?? '',
    defaultValue: parsed.value ?? '',
    type: 'readonlyText',
  });
  draft.customPropertyDescriptors = list;
  writeDraft(cwd, identity.n, draft);
  return preview;
}

export async function attrSet(cwd: string, input: {
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
  const list = draft.customPropertyDescriptors ?? [];
  const found = list.find((item) => item.key === parsed.key || item.name === parsed.name);
  if (found && (found.type === 'editableText' || found.type === 'select')) {
    // i18n: cli.attr.use_option
    throw new CliError('可选配置请用 version option set', 'ATTR_USE_OPTION');
  }
  if (found) {
    assertKeyUnchanged(String(found.key), parsed.key);
    if (parsed.value !== undefined) {
      if (parsed.value.length > MAX_VALUE) {
        // i18n: cli.attr.value_too_long
        throw new CliError('自定义属性值最长 100', 'ATTR_VALUE_LONG');
      }
      found.defaultValue = parsed.value;
    }
    if (parsed.name) {
      found.name = parsed.name;
    }
    if (parsed.remark !== undefined) {
      found.remark = parsed.remark;
    }
    const preview = await confirmWrite(previewLine(parsed), input.yes);
    writeDraft(cwd, identity.n, draft);
    return preview;
  }

  if (!parsed.key) {
    // i18n: cli.attr.not_found
    throw new CliError('找不到这条属性', 'ATTR_NOT_FOUND');
  }
  if (!draft.fileSha1) {
    // i18n: cli.attr.need_file
    throw new CliError('改附加属性须已有 fileSha1', 'ATTR_NEED_FILE');
  }
  const extras = draft.inputAttrs ?? [];
  const extra = extras.find((item) => item.key === parsed.key);
  if (extra) {
    extra.value = parsed.value ?? '';
  } else {
    extras.push({ key: parsed.key, value: parsed.value ?? '' });
  }
  draft.inputAttrs = extras;
  const preview = await confirmWrite(previewLine(parsed), input.yes);
  writeDraft(cwd, identity.n, draft);
  return preview;
}

export function attrRm(cwd: string, key: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    // i18n: cli.draft.missing
    throw new CliError('没有工作稿，请先 version draft pull', 'DRAFT_MISSING');
  }
  const list = draft.customPropertyDescriptors ?? [];
  const next = list.filter((item) => {
    if (item.key !== key) {
      return true;
    }
    if (item.type === 'editableText' || item.type === 'select') {
      return true;
    }
    return false;
  });
  if (next.length === list.length) {
    // i18n: cli.attr.not_found
    throw new CliError('找不到这条属性', 'ATTR_NOT_FOUND');
  }
  draft.customPropertyDescriptors = next;
  writeDraft(cwd, identity.n, draft);
  return key;
}

export function attrList(cwd: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  const list = (draft?.customPropertyDescriptors ?? []).filter(
    (item) => item.type !== 'select' && item.type !== 'editableText',
  );
  return list
    .map((item) => `${item.key}=${item.defaultValue ?? ''} ${item.name ?? ''}`)
    .join('\n');
}
