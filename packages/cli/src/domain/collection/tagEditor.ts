/** 合集标签只在内存编辑；不承担资料写入、发行或上架。 */
import { CliError } from '../../core/errors';
import { askInput, isInteractive, selectQuestion } from '../../core/tty';
import { FServiceAPI } from '../../platform/api';

export type AvailableCollectionTags = (params: { resourceTypeCode: string }) => Promise<unknown>;
type Recommendation = { tagId: string; tagName: string; tagType: 1 | 2; tagNote?: string };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** 根入口须在本地事务恢复前拒绝可立即判定的误用；域层也保留同一边界。 */
export function assertCollectionTagMode(input: { tags?: readonly string[]; clearTags?: boolean; editTags?: boolean; json?: boolean }): void {
  if ([input.tags !== undefined, !!input.clearTags, !!input.editTags].filter(Boolean).length > 1) {
    throw new CliError('--tag、--clear-tags、--edit-tags 不能同时使用', 'COLLECTION_TAGS_CONFLICT');
  }
  if (input.editTags && (input.json || !isInteractive())) {
    throw new CliError('--edit-tags 仅支持交互终端且不能与 --json 合用；脚本请使用 --tag 或 --clear-tags', 'COLLECTION_TAGS_TTY_REQUIRED');
  }
}

/** 与显式--tag保持同一约束；不把逗号拆成多个标签。 */
export function validateCollectionTags(raw: string[]): string[] {
  const tags = raw.map((item) => item.trim().replaceAll('#', ''));
  if (tags.some((item) => !item)) throw new CliError('标签不能包含空项', 'COLLECTION_TAG_EMPTY');
  if (tags.length > 20) throw new CliError('标签最多 20 个', 'COLLECTION_TAGS_TOO_MANY');
  if (tags.some((item) => item.length > 20)) throw new CliError('单个标签不能超过20个字符', 'COLLECTION_TAG_TOO_LONG');
  if (new Set(tags).size !== tags.length) throw new CliError('标签不能重复', 'COLLECTION_TAG_DUPLICATE');
  return tags;
}

/** JSON先转义控制字符，再转义不可见格式/分行字符；不修改待提交值。 */
export function collectionTagsPreview(tags: readonly string[]): string {
  return JSON.stringify(tags).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu,
    (char) => char.split('').map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));
}

async function prompt<T>(ask: () => Promise<T>): Promise<T> {
  try { return await ask(); } catch (error) {
    const cancelled = error instanceof Error && ['ExitPromptError', 'AbortPromptError'].includes(error.name);
    throw new CliError(cancelled ? '已取消标签编辑，未提交修改' : '标签编辑未能完成，未提交修改', cancelled ? 'FORM_CANCELLED' : 'COLLECTION_TAGS_PROMPT_FAILED');
  }
}

async function recommendations(resourceTypeCode: string, availableTags?: AvailableCollectionTags): Promise<Recommendation[]> {
  const invalid = () => new CliError('无法完整读取合集标签，请核对平台后重试；本次未提交修改', 'COLLECTION_TAGS_RESPONSE_INVALID');
  let response: unknown;
  try { response = await (availableTags ?? ((params) => FServiceAPI.Resource.availableTags(params)))({ resourceTypeCode }); }
  catch { throw invalid(); }
  if (!record(response) || response.ret !== 0 || response.errCode !== 0 || !Array.isArray(response.data)) throw invalid();
  for (const row of response.data) {
    if (!record(row) || typeof row.tagId !== 'string' || !row.tagId.trim() || typeof row.tagName !== 'string' || !row.tagName
      || ![1, 2].includes(row.tagType as number) || (row.tagNote !== undefined && typeof row.tagNote !== 'string')) throw invalid();
  }
  return response.data as Recommendation[];
}

/** 独立入口的内存菜单：原平台名称不归一化，旧非法值只能显式移除。 */
export async function editCollectionTags(input: {
  current: unknown; resourceTypeCode: string; availableTags?: AvailableCollectionTags;
}): Promise<string[]> {
  if (!Array.isArray(input.current) || input.current.some((tag) => typeof tag !== 'string')) {
    throw new CliError('当前合集标签不是完整字符串数组，未提交修改', 'COLLECTION_TAGS_RESPONSE_INVALID');
  }
  const tags: string[] = [...input.current];
  const available = await recommendations(input.resourceTypeCode, input.availableTags);
  const eligible = available.map((row, index) => ({ ...row, index })).filter((row) => {
    try { return validateCollectionTags([row.tagName])[0] === row.tagName; } catch { return false; }
  });
  if (eligible.length !== available.length) console.warn('提示：部分推荐/活动标签不符合当前标签约束，未提供选择；不会截断或改写。');
  for (;;) {
    const choices = [{ name: '完成编辑', value: 'done' }, { name: '取消全部修改', value: 'cancel' }];
    if (tags.length < 20) {
      choices.push({ name: '添加一个自定义标签', value: 'custom' });
      const offered = new Set(tags);
      for (const row of eligible) if (!offered.has(row.tagName)) {
        offered.add(row.tagName);
        choices.push({ name: `【${row.tagType === 1 ? '推荐' : '活动'}】${collectionTagsPreview([row.tagName])}${row.tagNote ? ` — ${collectionTagsPreview([row.tagNote.slice(0, 100)])}` : ''}`, value: `add:${row.index}` });
      }
    }
    choices.push(...tags.map((tag, index) => ({ name: `移除 ${collectionTagsPreview([tag])}`, value: `remove:${index}` })));
    const choice = await prompt(() => selectQuestion(`编辑合集标签（${tags.length}/20）：${collectionTagsPreview(tags)}`, choices, process.stderr));
    if (!choices.some((row) => row.value === choice)) throw new CliError('标签选择无效，未提交修改', 'COLLECTION_TAGS_SELECTION_INVALID');
    if (choice === 'cancel') throw new CliError('已取消标签编辑，未提交修改', 'FORM_CANCELLED');
    if (choice.startsWith('remove:')) { tags.splice(Number(choice.slice(7)), 1); continue; }
    if (choice.startsWith('add:')) { tags.push(available[Number(choice.slice(4))]!.tagName); continue; }
    const custom = choice === 'custom' ? await prompt(() => askInput('输入一个标签（最多20字符；逗号作为标签文字）', process.stderr)) : undefined;
    try {
      if (custom !== undefined) tags.push(...validateCollectionTags([...tags, custom]).slice(tags.length));
      else {
        const valid = validateCollectionTags(tags);
        if (valid.some((tag, index) => tag !== tags[index])) throw new CliError('现有标签格式不符合约束，请移除后重新添加', 'COLLECTION_TAG_INVALID');
        return [...tags];
      }
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      console.warn(error.message);
    }
  }
}
