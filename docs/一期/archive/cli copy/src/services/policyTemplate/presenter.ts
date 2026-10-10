import { consola } from 'consola';
import type { PolicyTemplatePreview, PolicyTemplateSummary } from './types.js';

export function printPolicyTemplateList(templates: PolicyTemplateSummary[]): void {
  if (!templates.length) {
    consola.warn('当前资源类型没有可用策略模板');
    return;
  }
  for (const template of templates) {
    const inputs = template.inputs.map((input) => input.name).join(', ') || '-';
    consola.info(`${template.id}  ${template.title}  params=${inputs}`);
  }
}

export function printPolicyTemplatePreview(preview: PolicyTemplatePreview): void {
  consola.info(`策略名称：${preview.policyName}`);
  if (preview.translation) consola.info(`策略译文：${preview.translation}`);
  consola.info(`策略代码 SHA256：${preview.codeDigest}`);
}

export function formatPolicyTemplateOption(template: PolicyTemplateSummary): string {
  const inputs = template.inputs.length ? ` · 参数 ${template.inputs.length}` : '';
  return `${template.title}${inputs} · ${template.id}`;
}
