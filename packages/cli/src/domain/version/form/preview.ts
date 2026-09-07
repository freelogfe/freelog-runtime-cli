/** 落盘前的格式化预览：attr/option/dep 共用。--yes 跳过确认，但预览照样打印。 */

import type { ParsedLine } from './parseLine';

/** 预览文本：按固定字段序输出（extra 兜底追加），供写盘前确认。 */
export function previewLine(parsed: ParsedLine): string {
  const lines = [
    parsed.name ? `名称=${parsed.name}` : undefined,
    parsed.key ? `键=${parsed.key}` : undefined,
    parsed.remark ? `说明=${parsed.remark}` : undefined,
    parsed.mode ? `方式=${parsed.mode}` : undefined,
    parsed.defaultValue ? `默认=${parsed.defaultValue}` : undefined,
    parsed.options ? `选项=${parsed.options}` : undefined,
    parsed.value ? `值=${parsed.value}` : undefined,
    ...Object.entries(parsed.extra).map(([key, value]) => `${key}=${value}`),
  ].filter(Boolean);
  return ['预览：', ...lines.map((line) => `  ${line}`)].join('\n');
}
