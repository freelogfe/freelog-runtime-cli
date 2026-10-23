/** 线上来源的只读交互；选择不是写入资格，调用者必须重新走完整add校验。 */
import { CliError } from '../../core/errors';
import { askInput, selectQuestion } from '../../core/tty';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';

type Choice = { name: string; value: string; disabled?: boolean | string };
type Row = { resourceId: string; resourceName: string; resourceTitle: string; userId: number; subjectType: number;
  status: number; latestVersion: string; resourceType: string[]; resourceTypeCode: string };
type TypeNode = { code: string; name: string; children: TypeNode[] };
type Filter = { resourceType?: string; resourceTypeCode?: string; resourceTypeCategory?: 2 };
export type CollectionItemPickerApis = {
  listResources?: (params: Record<string, unknown>) => Promise<unknown>;
  resourceTypes?: (params: Record<string, unknown>) => Promise<unknown>;
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.-]+$/u.test(v) && v !== '.' && v !== '..';
const invalid = () => new CliError('平台资源选择列表或分页无效，未提交添加', 'COLLECTION_ITEM_PICKER_RESPONSE_INVALID');
const cancelled = () => new CliError('已取消单品选择', 'COLLECTION_ITEM_SELECTION_CANCELLED');
const quote = (v: string) => JSON.stringify(v).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu,
  (char) => char.split('').map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));
function data(response: unknown): unknown {
  if (!record(response) || response.ret !== 0 || response.errCode !== 0) throw invalid();
  return response.data;
}
function pageRows(response: unknown, skip: number, total: number | undefined): { rows: Row[]; total: number } {
  const p = data(response);
  if (!record(p) || p.skip !== skip || p.limit !== 50 || !Number.isSafeInteger(p.totalItem) || (p.totalItem as number) < skip
    || total !== undefined && total !== p.totalItem || !Array.isArray(p.dataList)
    || p.dataList.length !== Math.min(50, (p.totalItem as number) - skip)) throw invalid();
  const seen = new Set<string>();
  const rows = p.dataList.map((r): Row => {
    if (!record(r) || !id(r.resourceId) || seen.has(r.resourceId) || typeof r.resourceName !== 'string'
      || !/^[^\s/:]+\/[^\s/:]+$/u.test(r.resourceName) || /[\p{Cc}\p{Cf}]/u.test(r.resourceName)
      || typeof r.resourceTitle !== 'string' || !Number.isSafeInteger(r.userId) || (r.userId as number) <= 0
      || !Number.isSafeInteger(r.subjectType) || !Number.isSafeInteger(r.status) || typeof r.latestVersion !== 'string'
      || !Array.isArray(r.resourceType) || r.resourceType.length === 0 || r.resourceType.some((s) => typeof s !== 'string' || !s.trim())
      || !id(r.resourceTypeCode)) throw invalid();
    seen.add(r.resourceId); return r as Row;
  });
  return { rows, total: p.totalItem as number };
}
function parseTypes(response: unknown): TypeNode[] {
  const codes = new Set<string>();
  function visit(value: unknown, depth: number): TypeNode[] {
    if (!Array.isArray(value) || depth > 32) throw invalid();
    return value.map((node): TypeNode => {
      if (!record(node) || !id(node.code) || codes.has(node.code) || typeof node.name !== 'string' || !node.name.trim()
        || !(Array.isArray(node.children) || node.children === '')) throw invalid();
      codes.add(node.code); return { code: node.code, name: node.name, children: visit(node.children === '' ? [] : node.children, depth + 1) };
    });
  }
  return visit(data(response), 0);
}
function unavailable(r: Row, userId: number, existing: ReadonlySet<string>): string | undefined {
  if (r.userId !== userId) return '非当前账号';
  if (r.subjectType !== 1) return '不是单资源';
  if (r.status !== 1) return '未上架';
  if (!r.latestVersion.trim()) return '没有最新版本';
  if (existing.has(r.resourceId)) return '已在目录草稿';
}
/** 固定50条分页、搜索/层级筛选和跨页多选；不读取本地资源、不发写请求。 */
export async function pickCollectionItemSources(input: {
  userId: number; existingIds: readonly string[]; apis?: CollectionItemPickerApis;
  choose?: (message: string, choices: Choice[]) => Promise<string>;
  input?: (message: string) => Promise<string>;
}): Promise<string[]> {
  assertPlatformAllowed();
  const request = input.apis?.listResources ?? ((params) => FServiceAPI.Resource.list(params as never));
  const typesRequest = input.apis?.resourceTypes ?? ((params) => FServiceAPI.Resource.resourceTypes(params as never));
  const select = input.choose ?? ((message, choices) => selectQuestion(message, choices, process.stderr));
  const ask = input.input ?? ((message) => askInput(message, process.stderr));
  const prompt = async (message: string, choices: Choice[]) => {
    try { return await select(message, choices); }
    catch (error) { if (error instanceof Error && error.name === 'ExitPromptError') throw cancelled(); throw error; }
  };
  const text = async (message: string) => {
    try { return await ask(message); }
    catch (error) { if (error instanceof Error && error.name === 'ExitPromptError') throw cancelled(); throw error; }
  };
  const selected = new Map<string, Row>(), existing = new Set(input.existingIds), pages = new Map<number, Row[]>();
  let page = 0, total: number | undefined, keyword = '', filter: Filter = {}, typeTree: TypeNode[] | undefined;
  const reset = () => { page = 0; total = undefined; pages.clear(); };
  const read = async () => {
    if (pages.has(page)) return pages.get(page)!;
    let response: unknown;
    try { response = await request({ skip: page * 50, limit: 50, isSelf: 1, subjectType: 1, ...(keyword ? { keywords: keyword } : {}), ...filter }); }
    catch { throw invalid(); }
    const parsed = pageRows(response, page * 50, total), oldIds = new Set([...pages.values()].flat().map((r) => r.resourceId));
    if (parsed.rows.some((r) => oldIds.has(r.resourceId))) throw invalid();
    total = parsed.total; pages.set(page, parsed.rows); return parsed.rows;
  };
  const chooseFilter = async (): Promise<Filter | undefined> => {
    if (!typeTree) { try { typeTree = parseTypes(await typesRequest({ category: 1, status: 1, subjectType: 1 })); } catch { throw invalid(); } }
    const frames: Array<{ rows: TypeNode[]; parent?: TypeNode; path: string[] }> = [{ rows: typeTree, path: [] }];
    while (frames.length) {
      const f = frames[frames.length - 1]!;
      const choice = await prompt(`筛选资源类型 ${quote(f.path.join(' / '))}`, [
        { name: f.parent ? '全部本分类' : '全部类型', value: 'all' }, ...f.rows.map((n) => ({ name: `${quote(n.name)} (${n.code})`, value: `type:${n.code}` })),
        ...(frames.length > 1 ? [{ name: '返回上一级', value: 'back' }] : []), { name: '取消筛选修改', value: 'cancel' }]);
      if (choice === 'cancel') return undefined;
      if (choice === 'back' && frames.length > 1) { frames.pop(); continue; }
      if (choice === 'all') return f.parent ? { resourceType: f.parent.name } : {};
      const node = f.rows.find((n) => `type:${n.code}` === choice); if (!node) throw invalid();
      if (!node.children.length) return { resourceTypeCode: node.code, resourceTypeCategory: 2 };
      frames.push({ rows: node.children, parent: node, path: [...f.path, node.name] });
    }
  };
  while (true) {
    const rows = await read();
    const choices: Choice[] = rows.map((r) => {
      const reason = unavailable(r, input.userId, existing) ?? (!selected.has(r.resourceId) && selected.size >= 100 ? '已选满100项' : undefined);
      return { name: `${selected.has(r.resourceId) ? '[已选]' : '[ ]'} ${quote(r.resourceTitle)} | ${quote(r.resourceName)} | ${quote(r.resourceType.join(' / '))} | ${quote(r.latestVersion)} | 状态${r.status}${reason ? `（${reason}）` : ''}`,
        value: `resource:${r.resourceId}`, ...(reason && !selected.has(r.resourceId) ? { disabled: reason } : {}) };
    });
    choices.push(...(page > 0 ? [{ name: '上一页', value: 'previous' }] : []), ...((page + 1) * 50 < total! ? [{ name: '下一页', value: 'next' }] : []),
      { name: '搜索（回车清除）', value: 'search' }, { name: '筛选资源类型', value: 'filter' }, { name: `查看/移除已选（${selected.size}项）`, value: 'review' },
      { name: '完成选择', value: 'done', disabled: selected.size === 0 }, { name: '取消', value: 'cancel' });
    const choice = await prompt(`线上单资源（第${page + 1}/${Math.max(1, Math.ceil(total! / 50))}页，已选${selected.size}/100）`, choices);
    if (choice === 'cancel') throw cancelled();
    if (choice === 'done') { if (selected.size) return [...selected.keys()]; continue; }
    if (choice === 'next' && (page + 1) * 50 < total!) { page += 1; continue; }
    if (choice === 'previous' && page > 0) { page -= 1; continue; }
    if (choice === 'search') { keyword = (await text('搜索线上单资源（回车清除）')).trim(); reset(); continue; }
    if (choice === 'filter') { const changed = await chooseFilter(); if (changed !== undefined) { filter = changed; reset(); } continue; }
    if (choice === 'review') {
      while (true) {
        const picked = await prompt('已选来源（选中可移除）', [...selected.values()].map((r) => ({ name: `${r.resourceId} ${quote(r.resourceTitle)}`, value: `remove:${r.resourceId}` })).concat([{ name: '返回资源库', value: 'back' }]));
        if (picked === 'back') break;
        if (!picked.startsWith('remove:') || !selected.delete(picked.slice(7))) throw invalid();
      }
      continue;
    }
    const row = rows.find((r) => `resource:${r.resourceId}` === choice); if (!row) throw invalid();
    if (selected.has(row.resourceId)) selected.delete(row.resourceId);
    else if (!unavailable(row, input.userId, existing) && selected.size < 100) selected.set(row.resourceId, row);
  }
}
