/** 脚手架模板清单：runtime/package 的内置模板与 --template 匹配。 */

import { CliError } from '../../core/errors';

export type TemplateScaffold = 'runtime' | 'package';

export type TemplateItem = {
  id: string;
  scaffold: TemplateScaffold;
  name: string;
};

export const TEMPLATES: readonly TemplateItem[] = [
  { id: 'vite-theme', scaffold: 'runtime', name: 'Vite 主题' },
  { id: 'vite-widget', scaffold: 'runtime', name: 'Vite 插件' },
  { id: 'vite-theme-vue', scaffold: 'runtime', name: 'Vite Vue 主题' },
  { id: 'vite-widget-vue', scaffold: 'runtime', name: 'Vite Vue 插件' },
  { id: 'pkg-frontend', scaffold: 'package', name: '前端库' },
  { id: 'pkg-software', scaffold: 'package', name: '软件库' },
  { id: 'pkg-node', scaffold: 'package', name: 'Node 库' },
];

/** 列模板；scaffold 给了但不合法直接报错（不加过滤降级）。 */
export function listTemplates(scaffold?: string): TemplateItem[] {
  if (scaffold !== undefined && scaffold !== 'runtime' && scaffold !== 'package') {
    // i18n: cli.template.scaffold_invalid
    throw new CliError('模板种类只能是 runtime 或 package', 'TEMPLATE_SCAFFOLD_INVALID');
  }
  return TEMPLATES.filter((item) => !scaffold || item.scaffold === scaffold);
}

/** 模板列表行文本（id + scaffold + 名称）。 */
export function formatTemplateList(items: readonly TemplateItem[]): string {
  return items.map((item) => `${item.id}\t${item.scaffold}\t${item.name}`).join('\n');
}
