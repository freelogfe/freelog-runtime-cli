/** 主题/插件线上模板清单：固定 npm 包和版本，供 list 与 init 共用。 */

import { CliError } from '../../core/errors';

export type TemplateTarget = 'theme' | 'widget';

export type TemplateItem = {
  id: string;
  npmName: string;
  version: string;
  name: string;
  targets: readonly TemplateTarget[];
};

export const TEMPLATES: readonly TemplateItem[] = [
  { id: 'vite-vue-ts', npmName: '@freelog-cli/template-vite-vue-ts', version: '4.0.0', name: 'Vite Vue TS', targets: ['theme', 'widget'] },
  { id: 'vite-vue', npmName: '@freelog-cli/template-vite-vue', version: '4.0.0', name: 'Vite Vue', targets: ['theme', 'widget'] },
  { id: 'vite-react-ts', npmName: '@freelog-cli/template-vite-react-ts', version: '4.0.0', name: 'Vite React TS', targets: ['theme', 'widget'] },
  { id: 'vite-react', npmName: '@freelog-cli/template-vite-react', version: '4.0.0', name: 'Vite React', targets: ['theme', 'widget'] },
];

/** 列出本期受支持的主题/插件模板。 */
export function listTemplates(): readonly TemplateItem[] {
  return TEMPLATES;
}

/** 查找模板；未知 id 或不适用于快捷类型时直接失败。 */
export function getTemplate(id: string, target: TemplateTarget): TemplateItem {
  const template = TEMPLATES.find((item) => item.id === id);
  if (!template || !template.targets.includes(target)) {
    // i18n: cli.template.not_found
    throw new CliError(`找不到可用于${target === 'theme' ? '主题' : '插件'}的模板 ${id}`, 'TEMPLATE_NOT_FOUND');
  }
  return template;
}

/** 模板列表行文本（id、固定版本、名称）。 */
export function formatTemplateList(items: readonly TemplateItem[]): string {
  return items.map((item) => `${item.id}\t${item.version}\t${item.name}`).join('\n');
}
