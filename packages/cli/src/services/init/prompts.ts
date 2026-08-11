import * as p from '@clack/prompts';
import { listTemplateRefs } from '../compat.js';
import { TEMPLATE_DISPLAY_NAMES } from './catalog.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';

/** init 交互：选 runtime / package 工程模板 */
export async function pickInitTemplate(
  scaffold: 'runtime' | 'package',
  runtime?: '0.4' | '0.5',
): Promise<string> {
  const rows = listTemplateRefs().filter((row) => {
    if (row.scaffold !== scaffold) return false;
    if (scaffold === 'runtime') return row.runtime === (runtime || '0.5');
    return true;
  });
  if (!rows.length) {
    throw cliError(I18N_KEYS.no_templates_available, { code: 4, hint: 'freelog-cli template list' });
  }
  const choice = await p.select({
    message: scaffold === 'runtime' ? '请选择主题/插件工程模板' : '请选择前端库工程模板',
    options: rows.map((row) => ({
      value: row.id,
      label: TEMPLATE_DISPLAY_NAMES[row.id] || row.id,
      hint: row.runtime ? `runtime ${row.runtime}` : 'package',
    })),
  });
  if (p.isCancel(choice)) {
    throw cliError(I18N_KEYS.cancelled_template_pick, { code: 4 });
  }
  return String(choice);
}

/** init 交互：package namespace */
export async function pickInitNamespace(): Promise<string> {
  const ns = await p.text({
    message: '请输入前端库 namespace（如 myLib，会自动加 freelogLibrary. 前缀）',
    validate: (value) => (value?.trim() ? undefined : 'namespace 不能为空'),
  });
  if (p.isCancel(ns)) {
    throw cliError(I18N_KEYS.cancelled_namespace_input, { code: 4 });
  }
  let formatted = String(ns).trim();
  if (!formatted.startsWith('freelogLibrary.')) {
    formatted = `freelogLibrary.${formatted}`;
  }
  return formatted;
}

/** init 交互：资源短名 + 展示标题 */
export async function pickInitResourceIdentity(
  defaultName: string,
): Promise<{ resourceName: string; title: string }> {
  const answers = await p.group({
    resourceName: () =>
      p.text({
        message: '资源短授权标识（英文/数字/下划线/横杠）',
        defaultValue: defaultName,
        validate: (value) =>
          /^[a-zA-Z0-9_-]+$/.test(String(value || '').trim())
            ? undefined
            : '只能包含英文、数字、下划线和横杠',
      }),
    title: () =>
      p.text({
        message: '资源标题（展示名）',
        defaultValue: defaultName,
        validate: (value) => (String(value || '').trim() ? undefined : '标题不能为空'),
      }),
  });
  if (p.isCancel(answers)) {
    throw cliError(I18N_KEYS.cancelled_resource_info_input, { code: 4 });
  }
  return {
    resourceName: String(answers.resourceName).trim(),
    title: String(answers.title).trim(),
  };
}
