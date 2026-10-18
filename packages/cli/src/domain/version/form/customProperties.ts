/** 表单与最终提交共用的自定义属性/可选配置约束，防止直接改 JSON 绕过终端校验。 */
import { CliError } from '../../../core/errors';
import { assertValidKey } from './parseLine';

export const MAX_PROPERTY_NAME = 50;
export const MAX_PROPERTY_REMARK = 50;
export const MAX_PROPERTY_VALUE = 140;
export const MAX_PROPERTY_ITEMS = 30;

/** 校验完整列表；系统保留键/名称由当前平台命名空间另行检查。 */
export function assertCustomPropertyDescriptors(items: readonly Record<string, unknown>[]): void {
  const keys = new Set<string>();
  const names = new Set<string>();
  let customCount = 0;
  let optionCount = 0;
  const invalid = (reason: string): never => {
    throw new CliError(`自定义属性或可选配置无效：${reason}`, 'CUSTOM_PROPERTY_INVALID');
  };
  for (const item of items) {
    if (typeof item.key !== 'string' || typeof item.name !== 'string' || !item.name.trim()) {
      invalid('每项必须提供键和非空名称');
    }
    const key = item.key as string;
    const name = item.name as string;
    assertValidKey(key);
    if (name.length > MAX_PROPERTY_NAME) invalid(`名称不能超过 ${MAX_PROPERTY_NAME} 个字符`);
    if (keys.has(key) || names.has(name)) invalid(`键或名称重复：${key} / ${name}`);
    keys.add(key);
    names.add(name);
    if (item.remark !== undefined && (typeof item.remark !== 'string' || item.remark.length > MAX_PROPERTY_REMARK)) {
      invalid(`说明须为不超过 ${MAX_PROPERTY_REMARK} 个字符的文本`);
    }
    if (typeof item.defaultValue !== 'string' || item.defaultValue.length > MAX_PROPERTY_VALUE) {
      invalid(`默认值须为不超过 ${MAX_PROPERTY_VALUE} 个字符的文本`);
    }
    if (item.type === 'readonlyText') customCount += 1;
    else if (item.type === 'editableText' || item.type === 'select') optionCount += 1;
    else invalid(`不支持属性类型 ${String(item.type)}`);
    if (customCount > MAX_PROPERTY_ITEMS || optionCount > MAX_PROPERTY_ITEMS) invalid('自定义属性和可选配置各最多 30 项');
    if (item.type === 'select') {
      const candidates = item.candidateItems;
      if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > MAX_PROPERTY_ITEMS
        || candidates.some((value) => typeof value !== 'string' || !value.trim() || value.length > MAX_PROPERTY_VALUE)) {
        invalid('下拉候选须为 1–30 个非空文本，每个最长 140 字符');
      }
      const values = candidates as string[];
      if (new Set(values).size !== values.length || item.defaultValue !== values[0]) invalid('下拉候选不能重复，默认值必须为第一项');
    } else if (item.candidateItems !== undefined && (!Array.isArray(item.candidateItems) || item.candidateItems.length > 0)) {
      // 线上版本 DTO 可显式带 []；它与文本字段省略候选项等价，不能阻断合法继承。
      invalid('非下拉字段不能带非空候选项');
    }
  }
}
