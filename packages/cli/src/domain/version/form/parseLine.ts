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

export function assertKeyUnchanged(previous: string | undefined, next: string | undefined): void {
  if (previous && next && previous !== next) {
    // i18n: cli.form.key_immutable
    throw new CliError('键不能改', 'FORM_KEY_IMMUTABLE');
  }
}

export function assertValidKey(key: string): void {
  if (!KEY_RE.test(key)) {
    // i18n: alert_naming_convention_key
    throw new CliError(
      '请输入英文字母、数字或下划线，首字符必须为字母，长度不能超过30个字符',
      'FORM_KEY_INVALID',
    );
  }
}
