import { cliError } from '../../i18n/cliError.js';
import type { PlatformResourceInfo } from '../sync/index.js';
import type {
  PolicyTemplateInput,
  PolicyTemplateParam,
  PolicyTemplateSummary,
} from './types.js';

/**
 * Console `reportUiTemplate` 在 CLI 里的等价表单规则。
 *
 * 命令行参数和 TTY prompt 最终都要通过这里归一化，保证 number/select/datetime 的必填、
 * min、precision 和可选项校验不会因为入口不同而漂移。
 */
function policyNames(info: { policies?: PlatformResourceInfo['policies'] }): string[] {
  return (info.policies ?? []).map((policy) => policy.policyName || '').filter(Boolean);
}

function decimalLength(value: string): number {
  const normalized = value.trim().toLowerCase();
  const plain = normalized.includes('e') ? String(Number(normalized)) : normalized;
  return plain.includes('.') ? plain.split('.')[1]?.length ?? 0 : 0;
}

export function parseTemplateParams(raw?: string | string[]): PolicyTemplateParam[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values
    .flatMap((value) => String(value).split(','))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf('=');
      if (index <= 0) {
        throw cliError('策略模板参数必须使用 key=value 格式', {
          code: 4,
          details: { value: part },
        });
      }
      return {
        name: part.slice(0, index).trim(),
        value: part.slice(index + 1).trim(),
      };
    });
}

export function assertTemplatePolicyName(
  name: string,
  info: { policies?: PlatformResourceInfo['policies'] },
): void {
  const trimmed = name.trim();
  if (!trimmed) throw cliError('请输入策略名称', { code: 4 });
  if (trimmed.length < 2) throw cliError('策略名称不少于 2 个字符', { code: 4 });
  if (trimmed.length > 20) throw cliError('策略名称不超过 20 个字符', { code: 4 });
  if (policyNames(info).map((item) => item.toLowerCase()).includes(trimmed.toLowerCase())) {
    throw cliError('策略名称已存在', { code: 4 });
  }
}

function normalizePolicyTemplateParam(
  input: PolicyTemplateInput,
  value: string | number,
): PolicyTemplateParam {
  if (input.type === 'number') {
    const raw = String(value).trim();
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      throw cliError(`策略模板参数 ${input.name} 必须是数字`, { code: 4 });
    }
    if (input.min != null && numeric < input.min) {
      throw cliError(`策略模板参数 ${input.name} 不能小于 ${input.min}`, { code: 4 });
    }
    if (input.precision === 0 && !Number.isInteger(numeric)) {
      throw cliError(`策略模板参数 ${input.name} 必须是整数`, { code: 4 });
    }
    if (input.precision != null && input.precision > 0 && decimalLength(raw) > input.precision) {
      throw cliError(`策略模板参数 ${input.name} 最多 ${input.precision} 位小数`, { code: 4 });
    }
    return { name: input.name, value: numeric };
  }

  const text = String(value).trim();
  if (!text) {
    throw cliError(`策略模板参数 ${input.name} 不能为空`, { code: 4 });
  }
  if (input.type === 'select' && input.options.length) {
    const allowed = input.options.map((option) => option.value);
    if (!allowed.includes(text)) {
      throw cliError(`策略模板参数 ${input.name} 必须从可选项中选择`, {
        code: 4,
        details: { allowed },
      });
    }
  }
  return { name: input.name, value: text };
}

export function normalizePolicyTemplateParams(
  template: PolicyTemplateSummary,
  params?: PolicyTemplateParam[],
): PolicyTemplateParam[] {
  const inputs = template.inputs;
  if (!inputs.length) {
    if (params?.length) {
      throw cliError('当前策略模板没有可填写参数', {
        code: 4,
        details: { params },
      });
    }
    return [];
  }

  const byName = new Map((params ?? []).map((param) => [param.name, param.value]));
  const knownNames = new Set(inputs.map((input) => input.name));
  for (const param of params ?? []) {
    if (!knownNames.has(param.name)) {
      throw cliError(`当前策略模板不支持参数 ${param.name}`, {
        code: 4,
        details: { availableParams: [...knownNames] },
      });
    }
  }

  return inputs.map((input) => {
    const value = byName.has(input.name) ? byName.get(input.name) : input.defaultValue;
    if (value == null || String(value).trim() === '') {
      throw cliError(`策略模板参数 ${input.name} 必填`, { code: 4 });
    }
    return normalizePolicyTemplateParam(input, value);
  });
}
