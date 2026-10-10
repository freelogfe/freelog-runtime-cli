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

/** 解析一行式：支持双引号及 `\"` 转义；未知/重复字段立即失败。 */
export function parseLine(line: string): ParsedLine {
  const result: ParsedLine = { extra: {} };
  const aliases: Record<string, keyof Omit<ParsedLine, 'extra'>> = {
    名称: 'name', name: 'name',
    键: 'key', key: 'key',
    值: 'value', value: 'value',
    说明: 'remark', remark: 'remark',
    方式: 'mode', mode: 'mode',
    默认: 'defaultValue', 默认值: 'defaultValue', default: 'defaultValue',
    选项: 'options', options: 'options',
  };
  const source = line.trim();
  let cursor = 0;
  while (cursor < source.length) {
    while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
    if (cursor >= source.length) break;
    const fieldStart = cursor;
    while (cursor < source.length && source[cursor] !== '=' && !/\s/u.test(source[cursor] ?? '')) cursor += 1;
    const field = source.slice(fieldStart, cursor);
    if (!field || source[cursor] !== '=') {
      throw new CliError(`无法解析：${source.slice(fieldStart)}`, 'FORM_LINE_INVALID');
    }
    const property = aliases[field];
    if (!property) {
      throw new CliError(`不支持字段：${field}`, 'FORM_FIELD_UNKNOWN');
    }
    if (result[property] !== undefined) {
      throw new CliError(`字段重复：${field}`, 'FORM_FIELD_DUPLICATE');
    }
    cursor += 1;
    let value = '';
    if (source[cursor] === '"') {
      cursor += 1;
      let closed = false;
      while (cursor < source.length) {
        const char = source[cursor++]!;
        if (char === '\\') {
          const escaped = source[cursor++];
          if (escaped !== '"' && escaped !== '\\') {
            throw new CliError('引号中的转义无效', 'FORM_LINE_INVALID');
          }
          value += escaped;
        } else if (char === '"') {
          closed = true;
          break;
        } else {
          value += char;
        }
      }
      if (!closed || (cursor < source.length && !/\s/u.test(source[cursor] ?? ''))) {
        throw new CliError('引号没有正确结束', 'FORM_LINE_INVALID');
      }
    } else {
      const valueStart = cursor;
      while (cursor < source.length && !/\s/u.test(source[cursor] ?? '')) cursor += 1;
      value = source.slice(valueStart, cursor);
    }
    result[property] = value;
  }
  if (Object.keys(result).length === 1) {
    throw new CliError('请提供字段', 'FORM_LINE_INVALID');
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
