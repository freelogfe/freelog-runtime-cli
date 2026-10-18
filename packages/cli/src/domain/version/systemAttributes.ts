/**
 * 系统属性的单一读取/校验边界。来源为类型 attrs 或当前 SHA 的分析结果；
 * 附加格式复用 Console getAttrsInfoByKeys 的平台定义与默认值，不复制其宽松数字转换。
 */
import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';
import { waitAnalyze } from './analyze';

export type SystemAttributeApis = {
  getByCode?: (params: { code: string }) => Promise<unknown>;
  getAttrsInfoByKey?: (params: { key: string }) => Promise<unknown>;
  filesListInfoSse?: (params: { sha1: string; resourceTypeCode: string }) => Promise<AsyncIterable<Uint8Array | string>>;
};

export type SystemAttribute = {
  key: string;
  name: string;
  insertMode: number;
  valueDisplay?: unknown;
  definition?: Record<string, unknown>;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function loadError(message: string): never {
  throw new CliError(`读取系统属性失败：${message}`, 'ATTR_SYSTEM_LOAD');
}

/** 裸对象仅供已有注入测试使用；真实信封的错误码不能因 data 存在而被忽略。 */
function unwrap(value: unknown): Record<string, unknown> {
  if (!record(value)) return loadError('平台响应不是对象');
  if (value.ret !== undefined && Number(value.ret) !== 0
    || value.errCode !== undefined && Number(value.errCode) !== 0
    || value.errcode !== undefined && Number(value.errcode) !== 0) {
    return loadError(typeof value.msg === 'string' ? value.msg : '平台返回错误');
  }
  const data = Object.hasOwn(value, 'data') ? value.data : value;
  if (!record(data)) return loadError('平台响应缺少有效数据');
  return data;
}

async function requestData(request: () => Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    return unwrap(await request());
  } catch (error) {
    if (error instanceof CliError) throw error;
    // 未知请求异常可能带 URL/凭据，只报告固定说明。
    return loadError('请求失败');
  }
}

function numberRule(rules: Record<string, unknown>, key: string, fallback: number): number {
  const value = rules[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) return loadError(`规则 ${key} 不是有限数值`);
  return value;
}

function calendarValue(value: string, datetime: boolean): boolean {
  const pattern = datetime
    ? /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u
    : /^(\d{4})-(\d{2})-(\d{2})$/u;
  const match = pattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!
    && (!datetime || Number(match[4]) <= 23 && Number(match[5]) <= 59 && Number(match[6]) <= 59);
}

/** 返回规则前验证平台结构；错误定义不能被当作“没有约束”。 */
function rulesFor(definition: Record<string, unknown>): Record<string, unknown> {
  const rules = definition.contentRule ?? {};
  if (!record(rules)) return loadError('contentRule 无效');
  const format = definition.format;
  const range = (minKey: string, maxKey: string, minDefault: number, maxDefault: number, integer = false) => {
    const min = numberRule(rules, minKey, minDefault);
    const max = numberRule(rules, maxKey, maxDefault);
    if (min > max || integer && (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0)) {
      loadError(`${minKey}/${maxKey} 区间无效`);
    }
  };
  if (format === 4 || format === 5) {
    const datetime = format === 5;
    const minKey = datetime ? 'startDateTime' : 'startDate';
    const maxKey = datetime ? 'limitDateTime' : 'limitDate';
    const min = rules[minKey] ?? (datetime ? '1000-01-01 00:00:00' : '1000-01-01');
    const max = rules[maxKey] ?? (datetime ? '9999-12-31 23:59:59' : '9999-12-31');
    if (typeof min !== 'string' || typeof max !== 'string' || !calendarValue(min, datetime) || !calendarValue(max, datetime) || min > max) {
      loadError('日期规则无效');
    }
  } else if (format === 6 || format === 7) {
    range('minLength', 'maxLength', 0, 140, true);
  } else if (format === 8) {
    range('min', 'max', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  } else if (format === 9) {
    range('minDecimal', 'maxDecimal', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    const precision = numberRule(rules, 'precision', Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(precision) || precision < 0) loadError('precision 必须是非负整数');
  } else if (format === 10 && rules.allowedElements !== undefined
    && (!Array.isArray(rules.allowedElements) || !rules.allowedElements.every((value) => typeof value === 'string'))) {
    loadError('下拉候选不是字符串列表');
  }
  return rules;
}

function metadataAttribute(value: unknown, fromType: boolean): SystemAttribute {
  if (!record(value) || typeof value.key !== 'string' || value.key.trim() === '') return loadError('系统属性缺少 key');
  if (value.name !== undefined && typeof value.name !== 'string') return loadError(`系统属性 ${value.key} 的名称无效`);
  const insertMode = fromType ? 0 : Number(value.insertMode ?? 0);
  if (!Number.isInteger(insertMode) || insertMode < 0) return loadError(`系统属性 ${value.key} 的 insertMode 无效`);
  return {
    key: value.key,
    name: typeof value.name === 'string' ? value.name : value.key,
    insertMode,
    ...(Object.hasOwn(value, 'valueDisplay') ? { valueDisplay: value.valueDisplay } : {}),
  };
}

/** 有分析结果优先消费终态，否则按 SHA 或类型读取；纯命名空间可跳过格式，但不能据此编辑值。 */
export async function loadSystemAttributes(input: {
  typeCode: string;
  sha1?: string;
  analysis?: Record<string, unknown>;
  includeDefinitions?: boolean;
  apis?: SystemAttributeApis;
}): Promise<SystemAttribute[]> {
  const apis = input.apis ?? {};
  if (input.analysis === undefined && !input.sha1) {
    const getByCode = apis.getByCode ?? ((params) => {
      assertPlatformAllowed();
      return FServiceAPI.Resource.getResourceTypeInfoByCode(params);
    });
    const type = await requestData(() => getByCode({ code: input.typeCode }));
    const attrs = type.attrs;
    if (!Array.isArray(attrs)) return loadError('资源类型 attrs 不是列表');
    return attrs.map((item) => metadataAttribute(item, true));
  }
  let analysis: Record<string, unknown>;
  try {
    analysis = unwrap(input.analysis ?? await waitAnalyze(input.sha1!, input.typeCode, apis));
  } catch (error) {
    if (error instanceof CliError) throw error;
    return loadError('文件分析请求失败');
  }
  const metadata = analysis.metaInfoArray;
  if (!Array.isArray(metadata)) return loadError('metaInfoArray 不是列表');
  const attributes = metadata.map((item) => metadataAttribute(item, false));
  if (input.includeDefinitions === false) return attributes;
  const getDefinition = apis.getAttrsInfoByKey ?? ((params) => {
    assertPlatformAllowed();
    return FServiceAPI.Resource.getAttrsInfoByKey(params);
  });
  return Promise.all(attributes.map(async (attribute) => {
    if (attribute.insertMode !== 2) return attribute;
    const definition = await requestData(() => getDefinition({ key: attribute.key }));
    if (definition.key !== attribute.key || typeof definition.format !== 'number' || !Number.isInteger(definition.format)) {
      return loadError(`附加属性 ${attribute.key} 的格式定义无效`);
    }
    rulesFor(definition);
    return { ...attribute, definition };
  }));
}

/** 冲突命名空间必须包括类型保留字段，不能只依赖解析服务展示的非空 raw。 */
export async function loadAttributeNamespace(input: {
  typeCode: string;
  sha1?: string;
  includeDefinitions?: boolean;
  apis?: SystemAttributeApis;
}): Promise<SystemAttribute[]> {
  const typeAttributes = await loadSystemAttributes({ typeCode: input.typeCode, apis: input.apis });
  if (!input.sha1) return typeAttributes;
  const parsedAttributes = await loadSystemAttributes(input);
  return [...new Map([...typeAttributes, ...parsedAttributes].map((attribute) => [attribute.key, attribute])).values()];
}

/** 系统保留键与名称都不能重建为用户字段；冲突应显式处理，不静默删除用户输入。 */
export function assertNoSystemAttributeConflict(attributes: readonly SystemAttribute[], input: { key?: string; name?: string }): void {
  const conflict = attributes.find((attribute) => input.key !== undefined && attribute.key === input.key
    || input.name !== undefined && attribute.name === input.name);
  if (conflict) {
    throw new CliError(`名称或键与系统属性 ${conflict.name} (${conflict.key}) 冲突；系统附加值请用 version attr set 修改，原始属性只读`, 'ATTR_SYSTEM_CONFLICT');
  }
}

/**
 * 输入字符串精确比较平台数字边界。仅比较符号、十进制数量级与数字序列，
 * 支持 Number.toString() 的科学记数法，不转浮点、不生成 10 的超大幂或补零大串。
 */
function compareDecimal(left: string, right: string): number {
  const normalize = (value: string) => {
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/u.exec(value)!;
    const unsigned = `${match[2]}${match[3] ?? ''}`.replace(/^0+/u, '');
    if (unsigned === '') return { negative: false, digits: '0', magnitude: 0 };
    const digits = unsigned.replace(/0+$/u, '');
    const scale = (match[3]?.length ?? 0) - Number(match[4] ?? 0) - (unsigned.length - digits.length);
    return { negative: match[1] === '-', digits, magnitude: digits.length - scale };
  };
  const first = normalize(left);
  const second = normalize(right);
  if (first.negative !== second.negative) return first.negative ? -1 : 1;
  const direction = first.negative ? -1 : 1;
  if (first.digits === '0' || second.digits === '0') {
    return first.digits === second.digits ? 0 : first.digits === '0' ? -direction : direction;
  }
  if (first.magnitude !== second.magnitude) return Math.sign(first.magnitude - second.magnitude) * direction;
  for (let index = 0; index < Math.max(first.digits.length, second.digits.length); index += 1) {
    const difference = (first.digits.charCodeAt(index) || 48) - (second.digits.charCodeAt(index) || 48);
    if (difference !== 0) return Math.sign(difference) * direction;
  }
  return 0;
}

/** 值始终保留原字符串；校验不 parseInt 前缀、不截断精度，也不把空串转换为 0。 */
export function assertSystemAttributeValue(attribute: SystemAttribute, value: string): void {
  const definition = attribute.definition;
  const format = definition?.format;
  if (attribute.insertMode !== 2 || typeof format !== 'number' || !Number.isInteger(format) || format < 4 || format > 10) {
    throw new CliError(`系统属性 ${attribute.key} 只读或暂不支持该格式`, 'ATTR_SYSTEM_READONLY');
  }
  const rules = rulesFor(definition!);
  const invalid = (reason: string): never => { throw new CliError(`附加属性 ${attribute.key}：${reason}`, 'ATTR_SYSTEM_VALUE'); };
  if (typeof value !== 'string') invalid('值必须是字符串');
  // Console 为 4–10 全部构造 nullable:true。空串明确清空，不受最小长度或区间约束。
  if (value === '') return;
  if (format === 4 || format === 5) {
    const datetime = format === 5;
    const min = String(rules[datetime ? 'startDateTime' : 'startDate'] ?? (datetime ? '1000-01-01 00:00:00' : '1000-01-01'));
    const max = String(rules[datetime ? 'limitDateTime' : 'limitDate'] ?? (datetime ? '9999-12-31 23:59:59' : '9999-12-31'));
    if (!calendarValue(value, datetime) || value < min || value > max) invalid(`请输入 ${min} 至 ${max} 内的合法${datetime ? '日期时间' : '日期'}`);
  } else if (format === 6 || format === 7) {
    const min = numberRule(rules, 'minLength', 0);
    const max = numberRule(rules, 'maxLength', 140);
    if (value.length < min || value.length > max || format === 6 && /[\r\n]/u.test(value)) invalid(`文本长度须在 ${min}–${max} 内${format === 6 ? '且不能换行' : ''}`);
  } else if (format === 8 || format === 9) {
    const integer = format === 8;
    const pattern = integer ? /^-?\d+$/u : /^-?\d+(?:\.\d+)?$/u;
    const numeric = Number(value);
    if (!pattern.test(value) || !Number.isFinite(numeric) || integer && !Number.isSafeInteger(numeric)) invalid(`请输入完整有效的${integer ? '整数' : '小数'}`);
    const min = numberRule(rules, integer ? 'min' : 'minDecimal', Number.MIN_SAFE_INTEGER);
    const max = numberRule(rules, integer ? 'max' : 'maxDecimal', Number.MAX_SAFE_INTEGER);
    const outsideRange = integer
      ? numeric < min || numeric > max || Math.abs(numeric) > 99999999999
      : compareDecimal(value, String(min)) < 0 || compareDecimal(value, String(max)) > 0;
    if (outsideRange) invalid(`数值超出允许范围 ${integer ? Math.max(min, -99999999999) : min}–${integer ? Math.min(max, 99999999999) : max}`);
    if (!integer && (value.split('.')[1]?.length ?? 0) > numberRule(rules, 'precision', Number.MAX_SAFE_INTEGER)) invalid('小数位超过允许精度，请明确修改输入，不会自动截断');
  } else if (!(rules.allowedElements as string[] | undefined ?? []).includes(value)) {
    invalid('值必须是平台下拉候选之一');
  }
}

/** 更新版本的请求字段不是读取 DTO；唯一事实是线上 systemPropertyDescriptors.valueDisplay。 */
export function restoreVersionInputAttrs(info: unknown): Array<Record<string, unknown>> {
  if (!record(info) || !Array.isArray(info.systemPropertyDescriptors)) return [];
  return info.systemPropertyDescriptors.flatMap((item): Array<Record<string, unknown>> => {
    if (!record(item) || Number(item.insertMode) !== 2 || typeof item.key !== 'string' || !item.key) return [];
    return [{ key: item.key, value: String(item.valueDisplay ?? '') }];
  });
}

/** 当前用户输入优先；失效值进入待复核，旧孤儿只有在完整规则再次通过后才恢复。 */
export function reconcileInputAttrs(input: {
  inputAttrs?: Array<Record<string, unknown>>;
  orphanedInputAttrs?: Array<Record<string, unknown>>;
  attributes: readonly SystemAttribute[];
}): { inputAttrs: Array<Record<string, unknown>>; orphanedInputAttrs: Array<Record<string, unknown>> } {
  const attributes = new Map(input.attributes.map((attribute) => [attribute.key, attribute]));
  const current = input.inputAttrs ?? [];
  const currentKeys = new Set(current.map((item) => item.key));
  const candidates = [...current, ...(input.orphanedInputAttrs ?? []).filter((item) => !currentKeys.has(item.key))];
  const result = { inputAttrs: [] as Array<Record<string, unknown>>, orphanedInputAttrs: [] as Array<Record<string, unknown>> };
  for (const item of candidates) {
    const attribute = typeof item.key === 'string' ? attributes.get(item.key) : undefined;
    if (!attribute) {
      result.orphanedInputAttrs.push(item);
      continue;
    }
    try {
      assertSystemAttributeValue(attribute, item.value as string);
      result.inputAttrs.push(item);
    } catch (error) {
      if (!(error instanceof CliError) || !['ATTR_SYSTEM_VALUE', 'ATTR_SYSTEM_READONLY'].includes(error.code ?? '')) throw error;
      result.orphanedInputAttrs.push(item);
    }
  }
  return result;
}
