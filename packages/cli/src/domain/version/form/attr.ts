/**
 * 属性表单：自定义属性（readonlyText）与系统附加 value。
 * 键写下后不能改；自定义 ≤30 条、值 ≤140（对照 Console 版本创建页 140，创建向导为 100，取宽者）；
 * 改附加 value 须已有 fileSha1（依赖平台解析结果）。
 */

import { CliError } from '../../../core/errors';
import { confirmDestructive, confirmWrite } from '../../../core/tty';
import { readDraft, writeDraft } from '../../../local/draft';
import { resolveIdentity } from '../../../local/resolve';
import { withProjectLock } from '../../../local/lock';
import { assertKeyUnchanged, assertValidKey, parseLine } from './parseLine';
import { previewLine } from './preview';

const MAX_CUSTOM = 30;
const MAX_VALUE = 140;
const MAX_NAME = 50;
const MAX_REMARK = 50;

/** 属性名称 ≤50（对照 Console fResourcePropertyEditorDrawer alert_naming_convention_attribute_name）。 */
function assertValidName(name: string): void {
  if (name.length > MAX_NAME) {
    // i18n: alert_naming_convention_attribute_name
    throw new CliError('名称不能超过50个字符', 'ATTR_NAME_LONG');
  }
}

/** 属性说明 ≤50（对照 Console alert_key_remark_length）。 */
function assertValidRemark(remark: string): void {
  if (remark.length > MAX_REMARK) {
    // i18n: alert_key_remark_length
    throw new CliError('不能超过50个字符。', 'ATTR_REMARK_LONG');
  }
}

function isCustom(item: Record<string, unknown>): boolean {
  return item.type !== 'editableText' && item.type !== 'select';
}

/** 加自定义属性：校验键/值/30 条上限/重复后确认写稿；系统附加走 set（须已有 fileSha1）。 */
export async function attrAdd(cwd: string, input: {
  line?: string;
  file?: string;
  yes?: boolean;
}): Promise<string> {
  return withProjectLock(cwd, () => attrAddLocked(cwd, input), 'version-attr-add');
}

async function attrAddLocked(cwd: string, input: {
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
  assertValidName(parsed.name);
  assertValidRemark(parsed.remark ?? '');
  if (parsed.value !== undefined && parsed.value.length > MAX_VALUE) {
    // i18n: cli.attr.value_too_long
    throw new CliError('自定义属性值最长 140', 'ATTR_VALUE_LONG');
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
  if (
    parsed.name &&
    list.some((item) => item.name === parsed.name) &&
    !list.some((item) => item.key === parsed.key && item.name === parsed.name)
  ) {
    // i18n: alert_key_name_exist
    throw new CliError('名称已存在', 'ATTR_NAME_DUPLICATE');
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

/** 改属性：先按键定位自定义属性改值/名/说明；定位不到且键对应附加属性时改 inputAttrs（须 fileSha1）。 */
export async function attrSet(cwd: string, input: {
  line?: string;
  file?: string;
  yes?: boolean;
}): Promise<string> {
  return withProjectLock(cwd, () => attrSetLocked(cwd, input), 'version-attr-set');
}

async function attrSetLocked(cwd: string, input: {
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
    assertValidName(parsed.name ?? String(found.name ?? ''));
    assertValidRemark(parsed.remark ?? String(found.remark ?? ''));
    if (parsed.value !== undefined) {
      if (parsed.value.length > MAX_VALUE) {
        // i18n: cli.attr.value_too_long
        throw new CliError('自定义属性值最长 140', 'ATTR_VALUE_LONG');
      }
      found.defaultValue = parsed.value;
    }
    if (parsed.name && list.some((item) => item.name === parsed.name && item.key !== found.key)) {
      // i18n: alert_key_name_exist
      throw new CliError('名称已存在', 'ATTR_NAME_DUPLICATE');
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
  if (!draft.fileSha1 || draft.analyzedSha1 !== draft.fileSha1) {
    // i18n: cli.attr.need_file
    throw new CliError('改附加属性须已有当前文件的分析结果', 'ATTR_NEED_FILE');
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

/** 删自定义属性；可选配置（select/editableText）不受影响，找不到报错。 */
export function attrRm(cwd: string, key: string, file?: string): string {
  return withProjectLock(cwd, () => attrRmLocked(cwd, key, file), 'version-attr-rm');
}

function attrRmLocked(cwd: string, key: string, file?: string): string {
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

/** 列自定义属性（key=值 名称）；不含可选配置与系统附加。 */
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

/** 列文件分析变化后尚未能写回当前表单的附加属性；空态也保持可脚本解析。 */
export function attrReview(cwd: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    throw new CliError('没有工作稿，请先 version draft pull', 'DRAFT_MISSING');
  }
  const items = draft.orphanedInputAttrs ?? [];
  if (items.length === 0) return '没有待复核的附加属性';
  return [
    '以下附加属性已不在当前文件分析结果中，不能提交：',
    ...items.map((item) => `  ${String(item.key ?? '（无键）')}=${String(item.value ?? '')}`),
    '重新上传包含该 key 的文件会自动恢复；确认不再需要可执行 version attr review discard <key>。',
  ].join('\n');
}

/** 明确丢弃一项待复核附加属性；必须确认，避免文件变化时静默丢用户输入。 */
export async function attrReviewDiscard(cwd: string, input: {
  key: string;
  file?: string;
  yes?: boolean;
}): Promise<string> {
  return withProjectLock(cwd, () => attrReviewDiscardLocked(cwd, input), 'version-attr-review-discard');
}

async function attrReviewDiscardLocked(cwd: string, input: {
  key: string;
  file?: string;
  yes?: boolean;
}): Promise<string> {
  const identity = resolveIdentity(cwd, input.file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    throw new CliError('没有工作稿，请先 version draft pull', 'DRAFT_MISSING');
  }
  const key = input.key.trim();
  const items = draft.orphanedInputAttrs ?? [];
  if (!key || !items.some((item) => item.key === key)) {
    throw new CliError('找不到待复核附加属性', 'ATTR_REVIEW_NOT_FOUND');
  }
  const preview = `即将丢弃待复核附加属性：${key}`;
  if (!await confirmDestructive(preview, '丢弃待复核附加属性', input.yes)) {
    return '已取消';
  }
  draft.orphanedInputAttrs = items.filter((item) => item.key !== key);
  writeDraft(cwd, identity.n, draft);
  return preview;
}
