import { describe, expect, it } from 'vitest';
import { collectionPublishPreview } from '../../src/domain/collection/publishPreview';
import type { CollectionForm } from '../../src/domain/collection/form';

const empty = (): CollectionForm => ({ $schema: 'freelog-cli.collection-form.v1', inputs: [], properties: [], options: [], description: '',
  display: { sort: 'ascending', title: 'resource-title', number: true, image: true, description: true, view: 'list' }, dependencies: [] });

describe('合集完整预览纯格式化：仅用已验证快照', () => {
  it('所有无差异领域均明确说明，不输出虚构的授权或目录变化', () => {
    expect(collectionPublishPreview({ env: 'test', resourceId: 'id', resourceName: 'alice/name', baseline: empty(), form: empty(),
      published: [], draft: [], authExcludedItems: [], merge: false })).toBe([
      '发布合集变更', '环境："test"', '目标："alice/name"', 'resourceId："id"', '目录：不合并目录',
      '【系统附加值】', '无变化', '【自定义属性】', '无变化', '【可选配置（select候选首项为默认值）】', '无变化', '简介：无变化',
      '【展示设置】', '无变化', '【直接依赖】', '无变化', '【目录草稿差异（本次不发布）】', '无变化', '目录顺序：[] → []',
      '授权排除映射：原样保留 []', '未查询实时消费授权；此预览不代表单品当前可访问。',
    ].join('\n'));
  });

  it('同key名称、说明、值和种类均保留，新增/删除输入和配置不漏', () => {
    const baseline: CollectionForm = { ...empty(), inputs: [{ key: 'removeInput', value: 'old' }],
      properties: [{ key: 'stable', name: '旧名', value: '旧值', description: '旧说明' }],
      options: [{ key: 'change', name: '选择', kind: 'input', value: '旧文本', description: '说明' }, { key: 'remove', name: '删除配置', kind: 'input', value: '旧值', description: '' }] };
    const form: CollectionForm = { ...empty(), inputs: [{ key: 'add', value: 'new' }],
      properties: [{ key: 'stable', name: '新名', value: '', description: '' }],
      options: [{ key: 'change', name: '新选择', kind: 'select', values: ['新默认', '新候选'], description: '' }] };
    const before = JSON.stringify({ baseline, form });
    const text = collectionPublishPreview({ env: 'test', resourceId: 'id', resourceName: 'name', baseline, form, published: [], draft: [], authExcludedItems: [], merge: false });
    for (const expected of ['删除 "removeInput"：{"key":"removeInput","value":"old"}', '新增 "add"：{"key":"add","value":"new"}',
      '修改 "stable"：{"key":"stable","name":"旧名","value":"旧值","description":"旧说明"} → {"key":"stable","name":"新名","value":"","description":""}',
      '删除 "remove"：{"key":"remove","name":"删除配置","kind":"input","value":"旧值","description":""}',
      '修改 "change"：{"key":"change","name":"选择","kind":"input","value":"旧文本","description":"说明"} → {"key":"change","name":"新选择","kind":"select","values":["新默认","新候选"],"description":""}']) expect(text).toContain(expected);
    expect(JSON.stringify({ baseline, form })).toBe(before);
  });

  it('同一itemId换来源须展示，资源展示标题变化不冒充可发布目录差异', () => {
    const published = [{ itemId: 'a', resourceId: 'old', itemTitle: '同名', sortId: 0, resourceTitle: '旧缓存', resourceName: 'old/name' }];
    const draft = [{ ...published[0]!, resourceId: 'new', resourceTitle: '新缓存', resourceName: 'new/name' }];
    const text = collectionPublishPreview({ env: 'test', resourceId: 'id', resourceName: 'name', baseline: empty(), form: empty(), published, draft,
      authExcludedItems: [{ resourceId: 'old', excludedType: 'policyId', excludedValue: 'policy' }], merge: true });
    expect(text).toContain('修改单品 "a" resourceId："old" → "new"');
    expect(text).not.toContain('缓存'); expect(text).not.toContain('old/name'); expect(text).not.toContain('new/name');
    expect(text).toContain('目录顺序：["a"] → ["a"]');
    expect(text).toContain('授权排除映射：原样保留 [{"resourceId":"old","excludedType":"policyId","excludedValue":"policy"}]');
  });

  it('目标、描述及所有动态值使用同一转义边界，长候选列表不截断', () => {
    const form = empty(); form.description = 'line\n\t\u001b[31m';
    form.options = [{ key: 'values', name: '选项', kind: 'select', values: Array.from({ length: 30 }, (_, index) => `${index}-${'x'.repeat(120)}`), description: '' }];
    const text = collectionPublishPreview({ env: 'test', resourceId: 'id\n', resourceName: 'name\r\n', baseline: empty(), form, published: [], draft: [], authExcludedItems: [], merge: false });
    expect(text).toContain('目标："name\\r\\n"'); expect(text).toContain('resourceId："id\\n"');
    expect(text).toContain('简介："" → "line\\n\\t\\u001b[31m"');
    expect(text).toContain(JSON.stringify(form.options[0]!.values));
    expect(text).not.toContain('\u001b');
  });

  it.each([0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069])('Unicode方向控制符U+%s不能隐藏或反转确认内容', (code) => {
    const control = String.fromCharCode(code), form = empty(); form.description = `before${control}after`;
    const text = collectionPublishPreview({ env: 'test', resourceId: 'id', resourceName: `name${control}`, baseline: empty(), form,
      published: [], draft: [], authExcludedItems: [], merge: false });
    expect(text).not.toContain(control);
    expect(text).toContain(`before\\u${code.toString(16).padStart(4, '0')}after`);
    expect(text).toContain(`name\\u${code.toString(16).padStart(4, '0')}`);
  });
});
