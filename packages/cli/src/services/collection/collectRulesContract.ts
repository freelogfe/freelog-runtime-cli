import { cliError } from '../../i18n/cliError.js';

export const COLLECT_RULE_KEYS = ['resourceTitle', 'resourceTypeCode', 'authIdentity'] as const;
export const COLLECT_RULE_OPERATORS = [
  'INCLUDES',
  'NOT_INCLUDES',
  'STARTS_WITH',
  'ENDS_WITH',
  'EQUAL',
  'NOT_EQUAL',
] as const;

export type CollectRuleKey = (typeof COLLECT_RULE_KEYS)[number];
export type CollectRuleOperator = (typeof COLLECT_RULE_OPERATORS)[number];

export interface CollectRuleCondition {
  key: CollectRuleKey;
  limitOperatorType: CollectRuleOperator;
  value: string;
}

export interface CollectRulesBody {
  status: 0 | 1;
  serializeStatus?: 0 | 1;
  conditionType: 1 | 2;
  filterConditions: CollectRuleCondition[];
}

const TEXT_OPERATORS = new Set<CollectRuleOperator>([
  'INCLUDES',
  'NOT_INCLUDES',
  'STARTS_WITH',
  'ENDS_WITH',
]);

function inputError(message: string, hint?: string): never {
  throw cliError(message, { code: 4, hint });
}

export function parseBinaryFlag(value: unknown, field: string): 0 | 1 | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (parsed !== 0 && parsed !== 1) inputError(`${field} 只能是 0 或 1`);
  return parsed;
}

export function parseConditionType(value: unknown): 1 | 2 | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (parsed !== 1 && parsed !== 2) {
    inputError('conditionType 只能是 1（every）或 2（some）');
  }
  return parsed;
}

export function normalizeCollectRulesBody(input: unknown, username?: string): CollectRulesBody {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    inputError('collect-rules 必须是 JSON 对象');
  }
  const value = input as Record<string, unknown>;
  const status = parseBinaryFlag(value.status, 'status');
  const serializeStatus = parseBinaryFlag(value.serializeStatus, 'serializeStatus');
  const conditionType = parseConditionType(value.conditionType);
  if (status === undefined || conditionType === undefined) {
    inputError('collect-rules 缺少 status 或 conditionType');
  }
  if (!Array.isArray(value.filterConditions) || value.filterConditions.length === 0) {
    inputError('filterConditions 至少需要一条有效条件');
  }

  const filterConditions = value.filterConditions.map((raw, index): CollectRuleCondition => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      inputError(`filterConditions[${index}] 必须是对象`);
    }
    const condition = raw as Record<string, unknown>;
    const key = String(condition.key || '') as CollectRuleKey;
    const operator = String(condition.limitOperatorType || '') as CollectRuleOperator;
    let conditionValue = typeof condition.value === 'string' ? condition.value.trim() : '';

    if (!COLLECT_RULE_KEYS.includes(key)) {
      inputError(`filterConditions[${index}].key 不受支持`, COLLECT_RULE_KEYS.join(' | '));
    }
    if (!COLLECT_RULE_OPERATORS.includes(operator)) {
      inputError(
        `filterConditions[${index}].limitOperatorType 不受支持`,
        COLLECT_RULE_OPERATORS.join(' | '),
      );
    }
    if (!conditionValue) inputError(`filterConditions[${index}].value 不能为空`);

    if (key === 'resourceTypeCode' && operator !== 'EQUAL') {
      inputError('resourceTypeCode 只支持 EQUAL，与 Console 选择器一致');
    }
    if ((key === 'resourceTitle' || key === 'authIdentity') && !TEXT_OPERATORS.has(operator)) {
      inputError(`${key} 不支持 ${operator}，与 Console 选择器一致`);
    }
    if (key === 'resourceTitle' && conditionValue.length > 100) {
      inputError('resourceTitle 匹配值不能超过 100 个字符');
    }
    if (key === 'authIdentity') {
      if (conditionValue.length > 60) inputError('authIdentity 匹配值不能超过 60 个字符');
      if (operator === 'STARTS_WITH' && username && !conditionValue.includes('/')) {
        conditionValue = `${username}/${conditionValue}`;
      }
    }

    return { key, limitOperatorType: operator, value: conditionValue };
  });

  return { status, serializeStatus, conditionType, filterConditions };
}
