/** Console 可选配置的持久化键。只在明确新增/编辑时转换，读回和提交不偷偷改名。 */
import { CliError } from '../../../core/errors';
import { assertValidKey } from './parseLine';

const prefix = 'options_';

function validate(key: string): string {
  if (key === prefix) throw new CliError('可选配置键在 options_ 后不能为空', 'OPTION_KEY_EMPTY');
  assertValidKey(key);
  return key;
}

/** 新建接受短键或完整键；最终总长度（含前缀）≤30，前缀只添加一次。 */
export function normalizeOptionKey(key: string): string {
  return validate(key.startsWith(prefix) ? key : `${prefix}${key}`);
}

/** 已有条目的显式编辑按 Console 的初始化/保存规则处理首个前缀。 */
export function normalizeEditedOptionKey(key: string): string {
  return validate(prefix + key.replace(prefix, ''));
}
