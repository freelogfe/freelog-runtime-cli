import type { ParsedLine } from './parseLine';

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
