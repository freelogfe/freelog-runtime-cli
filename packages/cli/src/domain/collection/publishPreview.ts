/** 只格式化同次预检的已验证快照，不请求授权、不改表单或目录。 */
import type { CollectionCatalogueItem } from './catalogue';
import type { AuthExcludedItem, CollectionForm } from './form';

type PreviewInput = {
  env: string;
  resourceId: string;
  resourceName: string;
  baseline: CollectionForm;
  form: CollectionForm;
  published: readonly CollectionCatalogueItem[];
  draft: readonly CollectionCatalogueItem[];
  authExcludedItems: readonly AuthExcludedItem[];
  merge: boolean;
};

// JSON区分空串/false并转义C0；补转义C1和换行/方向控制符，避免伪造终端结构。
function json(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function order(label: string, before: string[], after: string[]): string[] {
  return json(before) === json(after) ? [] : [`${label}：${json(before)} → ${json(after)}`];
}

/** 稳定key变化自然成为删除＋新增；不能用可变名称合并身份。 */
function fields<T>(before: readonly T[], after: readonly T[], key: (item: T) => string): string[] {
  const previous = new Map(before.map((entry) => [key(entry), entry]));
  const next = new Map(after.map((entry) => [key(entry), entry]));
  const lines: string[] = [];
  for (const entry of before) {
    const id = key(entry);
    if (!next.has(id)) lines.push(`删除 ${json(id)}：${json(entry)}`);
  }
  for (const entry of after) {
    const id = key(entry);
    if (!previous.has(id)) lines.push(`新增 ${json(id)}：${json(entry)}`);
    else if (json(previous.get(id)) !== json(entry)) lines.push(`修改 ${json(id)}：${json(previous.get(id))} → ${json(entry)}`);
  }
  return [...lines, ...order('顺序', before.map(key), after.map(key))];
}

function directory(before: readonly CollectionCatalogueItem[], after: readonly CollectionCatalogueItem[]): string[] {
  // 可变的资源展示标题不是本次可发布目录字段，避免把缓存变化伪装成发布。
  const project = ({ itemId, resourceId, itemTitle, sortId }: CollectionCatalogueItem) => ({ itemId, resourceId, itemTitle, sortId });
  const previous = new Map(before.map((entry) => [entry.itemId, project(entry)]));
  const next = new Map(after.map((entry) => [entry.itemId, project(entry)]));
  const lines: string[] = [];
  for (const entry of before) {
    if (!next.has(entry.itemId)) lines.push(`移除单品 ${json(entry.itemId)}：${json(project(entry))}`);
  }
  for (const entry of after) {
    const old = previous.get(entry.itemId);
    if (!old) lines.push(`新增单品 ${json(entry.itemId)}：${json(project(entry))}`);
    else {
      for (const field of ['resourceId', 'itemTitle', 'sortId'] as const) {
        if (old[field] !== entry[field]) lines.push(`修改单品 ${json(entry.itemId)} ${field}：${json(old[field])} → ${json(entry[field])}`);
      }
    }
  }
  const oldIds = before.map((entry) => entry.itemId), newIds = after.map((entry) => entry.itemId);
  const unchanged = lines.length === 0 && json(oldIds) === json(newIds);
  return [...(unchanged ? ['无变化'] : lines), `目录顺序：${json(oldIds)} → ${json(newIds)}`];
}

function section(title: string, lines: string[]): string {
  return `【${title}】\n${lines.length ? lines.join('\n') : '无变化'}`;
}

/** 生成完整确认内容；目录未合并和实时授权未核验都明确标注，不省略差异。 */
export function collectionPublishPreview(input: PreviewInput): string {
  const { baseline, form } = input;
  const display = (Object.keys(baseline.display) as (keyof CollectionForm['display'])[])
    .filter((key) => baseline.display[key] !== form.display[key])
    .map((key) => `${key}：${json(baseline.display[key])} → ${json(form.display[key])}`);
  return [
    '发布合集变更', `环境：${json(input.env)}`, `目标：${json(input.resourceName)}`, `resourceId：${json(input.resourceId)}`,
    `目录：${input.merge ? '合并服务端目录草稿' : '不合并目录'}`,
    section('系统附加值', fields(baseline.inputs, form.inputs, (entry) => entry.key)),
    section('自定义属性', fields(baseline.properties, form.properties, (entry) => entry.key)),
    section('可选配置（select候选首项为默认值）', fields(baseline.options, form.options, (entry) => entry.key)),
    `简介：${baseline.description === form.description ? '无变化' : `${json(baseline.description)} → ${json(form.description)}`}`,
    section('展示设置', display),
    section('直接依赖', fields(baseline.dependencies, form.dependencies, (entry) => entry.resourceId)),
    section(input.merge ? '目录草稿差异（本次合并）' : '目录草稿差异（本次不发布）', directory(input.published, input.draft)),
    `授权排除映射：原样保留 ${json(input.authExcludedItems)}`,
    '未查询实时消费授权；此预览不代表单品当前可访问。',
  ].join('\n');
}
