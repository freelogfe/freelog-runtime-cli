/**
 * 一行式「名称=… 键=…」解析：空格分隔、双引号包值、内部 \" 转义。
 * 同字段出现两次或出现表外字段 → 失败不写盘（键定位、键不可改）。
 */

import { CliError } from '../../../core/errors';

export type ParsedLine = {
  name?: string;
  key?: string;
  value?: string;
  remark?: string;
  mode?: string;
  defaultValue?: string;
  options?: string;
  extra: Record<string, string>;
};

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,29}$/;

/** 解析一行式：按「字段=值」切 token；已知字段进结果，未知字段进 extra（多余字段由调用方决定报错）。 */
export function parseLine(line: string): ParsedLine {
  const extra: Record<string, string> = {};
  const result: ParsedLine = { extra };
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const eq = token.indexOf('=');
    if (eq <= 0) {
      // i18n: cli.form.line_invalid
      throw new CliError(`无法解析：${token}`, 'FORM_LINE_INVALID');
    }
    const field = token.slice(0, eq);
    const value = token.slice(eq + 1);
    if (field === '名称' || field === 'name') {
      result.name = value;
    } else if (field === '键' || field === 'key') {
      result.key = value;
    } else if (field === '值' || field === 'value') {
      result.value = value;
    } else if (field === '说明' || field === 'remark') {
      result.remark = value;
    } else if (field === '方式' || field === 'mode') {
      result.mode = value;
    } else if (field === '默认' || field === '默认值' || field === 'default') {
      result.defaultValue = value;
    } else if (field === '选项' || field === 'options') {
      result.options = value;
    } else {
      extra[field] = value;
    }
  }
  return result;
}

/** 键不可改：old/new 都有且不同即报错（增改共用）。 */
export function assertKeyUnchanged(previous: string | undefined, next: string | undefined): void {
  if (previous && next && previous !== next) {
    // i18n: cli.form.key_immutable
    throw new CliError('键不能改', 'FORM_KEY_IMMUTABLE');
  }
}

/** 键规则：字母开头、字母/数字/下划线、≤30 字符（对照 Console naming_convention_key）。 */
export function assertValidKey(key: string): void {
  if (!KEY_RE.test(key)) {
    // i18n: alert_naming_convention_key
    throw new CliError(
      '请输入英文字母、数字或下划线，首字符必须为字母，长度不能超过30个字符',
      'FORM_KEY_INVALID',
    );
  }
}
