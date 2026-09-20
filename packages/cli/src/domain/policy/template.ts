/**
 * 授权策略模板的纯领域模型。
 *
 * 这里故意不知道“单资源/合集”、本地状态或 HTTP：两类主体只负责取得同一份模板
 * 快照，模板字段的归一化、指纹、编号和输入校验必须只有这一份实现。
 */

import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { CliError } from '../../core/errors';

export type TemplateValue = string | number | boolean;
export type TemplateFieldType = 'number' | 'select' | 'datetime';

export type TemplateOption = { value: TemplateValue; label: string };

export type PolicyTemplateField = {
  /** 服务端 field id；只在 CLI 内部映射，机器输出不暴露。 */
  fieldId: string;
  slot: number;
  type: TemplateFieldType;
  /**
   * 后台模板可给出空值、0 或过期选项；Console 会展示该模板但要求用户先填写。
   * 因此缺省值不是模板目录失败的理由，缺少安全默认值时此字段省略。
   */
  defaultValue?: TemplateValue;
  options: TemplateOption[];
  /** Console 已有的数值下限/精度；只在 number 字段存在。 */
  numberRule?: { min: number; precision: number };
};

export type PolicyTemplate = {
  id: string;
  name: string;
  report: string;
  summary?: string;
  compileType: 'normal' | 'collection';
  fields: PolicyTemplateField[];
  fingerprint: string;
};

export type TemplateParamInput = { slot: number; value: string };

export type PreparedPolicyTemplate = {
  template: PolicyTemplate;
  values: Map<number, TemplateValue>;
  policyText: string;
  translation: string;
};

function isValue(value: unknown): value is TemplateValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** 与 Console 一致：服务端默认值可能是 JSON 字面量或带成对引号的原文。 */
function normalizeDefaultValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  try {
    const parsed = JSON.parse(text);
    if (isValue(parsed)) return parsed;
  } catch {
    // 非 JSON 时按原文处理。
  }
  return text.replace(/^["']|["']$/g, '');
}

function error(message: string): never {
  throw new CliError(message, 'POLICY_TEMPLATE_DESCRIPTOR_INVALID');
}

function stringAt(raw: Record<string, unknown>, names: string[]): string | undefined {
  for (const name of names) {
    const value = raw[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function fieldFrom(value: unknown): Omit<PolicyTemplateField, 'slot'> {
  if (!value || typeof value !== 'object') error('策略模板字段不是对象');
  const raw = value as Record<string, unknown>;
  const fieldId = stringAt(raw, ['id']);
  if (!fieldId) error('策略模板字段缺少 id');
  const type = raw.uiSectionType;
  if (type !== 'number' && type !== 'select' && type !== 'datetime') {
    error(`策略模板字段 ${fieldId} 的 uiSectionType 不受支持`);
  }
  const normalizedDefaultValue = normalizeDefaultValue(raw.uiSectionDefaultValue);
  let defaultValue: TemplateValue | undefined = isValue(normalizedDefaultValue) ? normalizedDefaultValue : undefined;
  const options = type === 'select' ? normalizeOptions(fieldId, raw.selectOptions) : [];
  if (type === 'select') {
    // Console 同时兼容服务端把默认值给成 option value 或 label；CLI 归一化后只保留 value。
    const matched = options.find((item) => item.value === defaultValue || item.label === String(defaultValue));
    defaultValue = matched?.value;
  }
  const normalizedFieldId = fieldId.toLowerCase();
  const numberRule = type === 'number'
    ? (normalizedFieldId.includes('.relativetimeevent') || normalizedFieldId.includes('time.relative')
      ? { min: 1, precision: 0 }
      : { min: 0.01, precision: 2 })
    : undefined;
  let field: Omit<PolicyTemplateField, 'slot'> = {
    fieldId,
    type,
    options,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(numberRule ? { numberRule } : {}),
  };
  // 与 Console 一致：无效默认值不隐藏整个模板，而是要求用户编辑该槽位后才可预览/提交。
  if (defaultValue !== undefined) {
    try {
      validateValue({ ...field, slot: 0 }, String(defaultValue));
    } catch (cause) {
      if (!(cause instanceof CliError) || cause.code !== 'POLICY_TEMPLATE_PARAM_INVALID') throw cause;
      field = { ...field, defaultValue: undefined };
    }
  }
  return field;
}

function normalizeOptions(fieldId: string, value: unknown): TemplateOption[] {
  if (!Array.isArray(value) || value.length === 0) error(`策略模板字段 ${fieldId} 缺少 selectOptions`);
  const options = value.map((item): TemplateOption => {
    if (!item || typeof item !== 'object') error(`策略模板字段 ${fieldId} 包含无效选项`);
    const raw = item as Record<string, unknown>;
    if (!isValue(raw.value) || typeof raw.label !== 'string' || !raw.label.trim()) {
      error(`策略模板字段 ${fieldId} 包含无效选项`);
    }
    return { value: raw.value, label: raw.label.trim() };
  });
  if (new Set(options.map((item) => `${typeof item.value}:${item.value}`)).size !== options.length) {
    error(`策略模板字段 ${fieldId} 的选项值重复`);
  }
  return options;
}

function reportVariables(report: string): string[] {
  const values: string[] = [];
  for (const match of report.matchAll(/\$\{([^{}]+)\}/g)) {
    const id = match[1]?.trim();
    if (!id) error('策略模板说明包含空参数标记');
    values.push(id);
  }
  return values;
}

function templateFingerprint(template: Omit<PolicyTemplate, 'fingerprint'>): string {
  const canonical = JSON.stringify({
    id: template.id,
    compileType: template.compileType,
    report: template.report,
    fields: template.fields.map((field) => ({
      fieldId: field.fieldId,
      type: field.type,
      defaultValue: field.defaultValue,
      options: field.options.map((option) => ({ value: option.value, label: option.label })),
      ...(field.numberRule ? { numberRule: field.numberRule } : {}),
    })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** 服务端返回任一异常条目即整体失败，不能静默丢模板后误导用户。 */
export function normalizePolicyTemplate(value: unknown): PolicyTemplate {
  if (!value || typeof value !== 'object') error('策略模板不是对象');
  const raw = value as Record<string, unknown>;
  const id = stringAt(raw, ['id', 'templateId', 'policyTemplateId', '_id']);
  const name = stringAt(raw, ['name', 'templateName', 'policyName', 'title']);
  const report = stringAt(raw, ['policyReport']);
  if (!id || !name || !report) error('策略模板缺少 id、标题或 policyReport');
  const compileType: PolicyTemplate['compileType'] = raw.compileType === 'normal' || raw.compileType === 'collection'
    ? raw.compileType
    : error(`策略模板 ${id} 缺少有效 compileType`);
  const source = raw.policyReportUiTemplate ?? raw.reportUiTemplate;
  if (!Array.isArray(source)) error(`策略模板 ${id} 缺少 policyReportUiTemplate`);
  const fields = source.map((item, index) => ({ ...fieldFrom(item), slot: index + 1 }));
  if (new Set(fields.map((field) => field.fieldId)).size !== fields.length) error(`策略模板 ${id} 的字段 id 重复`);
  const variables = reportVariables(report);
  const variableIds = new Set(variables);
  // 平台实况存在只由编译器填充、没有 UI 描述符的保留变量。Console 也会保留该模板；
  // CLI 不把它伪造为用户参数，渲染时明确标为平台内置参数即可。
  for (const field of fields) {
    if (!variableIds.has(field.fieldId)) error(`策略模板 ${id} 的 UI 字段未出现在说明中`);
  }
  const summary = stringAt(raw, ['policyReportText', 'summary', 'description', 'eventSummary']);
  const base = { id, name, report, compileType, fields, ...(summary ? { summary } : {}) };
  return { ...base, fingerprint: templateFingerprint(base) };
}

/** 归一化接口返回的完整快照；任一损坏条目都会中止，避免静默漏模板。 */
export function normalizePolicyTemplates(values: readonly unknown[]): PolicyTemplate[] {
  return values.map(normalizePolicyTemplate);
}

/** 按字段编号在报告中标记同一变量；同变量重复出现只显示同一编号。 */
export function renderTemplateReport(template: PolicyTemplate, values: ReadonlyMap<number, TemplateValue>): string {
  const byId = new Map(template.fields.map((field) => [field.fieldId, field]));
  return template.report.replace(/\$\{([^{}]+)\}/g, (_whole, rawId: string) => {
    const field = byId.get(rawId.trim());
    if (!field) return '[平台内置参数]';
    const value = values.get(field.slot) ?? field.defaultValue;
    if (value === undefined) return `[${field.slot}: 未填写]`;
    const display = field.type === 'select'
      ? field.options.find((option) => option.value === value)?.label ?? String(value)
      : String(value);
    return `[${field.slot}: ${display}]`;
  });
}

/** 生成仅存在于当前进程的参数初始值，不写入本地状态。 */
export function defaultTemplateValues(template: PolicyTemplate): Map<number, TemplateValue> {
  return new Map(template.fields.flatMap((field) => field.defaultValue === undefined ? [] : [[field.slot, field.defaultValue] as const]));
}

function validateValue(field: PolicyTemplateField, raw: string): TemplateValue {
  if (field.type === 'number') {
    const value = Number(raw);
    if (!raw.trim() || !Number.isFinite(value)) throw new CliError(`参数 [${field.slot}] 必须是有限数字`, 'POLICY_TEMPLATE_PARAM_INVALID');
    const rule = field.numberRule ?? { min: 0.01, precision: 2 };
    if (value < rule.min) throw new CliError(`参数 [${field.slot}] 不能小于 ${rule.min}`, 'POLICY_TEMPLATE_PARAM_INVALID');
    const decimal = /^\+?\d+(?:\.(\d+))?$/.exec(raw.trim())?.[1]?.length ?? 0;
    if (decimal > rule.precision) throw new CliError(`参数 [${field.slot}] 最多保留 ${rule.precision} 位小数`, 'POLICY_TEMPLATE_PARAM_INVALID');
    return value;
  }
  if (field.type === 'datetime') {
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(raw);
    if (!match) {
      throw new CliError(`参数 [${field.slot}] 必须是 YYYY-MM-DD HH:mm`, 'POLICY_TEMPLATE_PARAM_INVALID');
    }
    const [year, month, day, hour, minute] = match.slice(1).map(Number);
    const parsed = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month! - 1 || parsed.getUTCDate() !== day || parsed.getUTCHours() !== hour || parsed.getUTCMinutes() !== minute) {
      throw new CliError(`参数 [${field.slot}] 不是有效日期时间`, 'POLICY_TEMPLATE_PARAM_INVALID');
    }
    return raw;
  }
  const option = field.options.find((item) => String(item.value) === raw);
  if (!option) throw new CliError(`参数 [${field.slot}] 必须是该选项的 value`, 'POLICY_TEMPLATE_PARAM_INVALID');
  return option.value;
}

/** 非交互参数须完整、无重复；交互编辑也复用同一类型校验。 */
export function resolveTemplateValues(template: PolicyTemplate, inputs: readonly TemplateParamInput[], requireEveryField: boolean): Map<number, TemplateValue> {
  const supplied = new Map<number, string>();
  for (const input of inputs) {
    if (!Number.isInteger(input.slot) || input.slot < 1 || !template.fields.some((field) => field.slot === input.slot)) {
      throw new CliError(`参数编号 [${input.slot}] 不属于当前模板`, 'POLICY_TEMPLATE_PARAM_UNKNOWN');
    }
    if (supplied.has(input.slot)) throw new CliError(`参数编号 [${input.slot}] 重复`, 'POLICY_TEMPLATE_PARAM_DUPLICATE');
    supplied.set(input.slot, input.value);
  }
  if (requireEveryField && supplied.size !== template.fields.length) {
    throw new CliError('非交互模式必须为模板每个参数显式提供 --param', 'POLICY_TEMPLATE_PARAM_REQUIRED');
  }
  const values = defaultTemplateValues(template);
  for (const field of template.fields) {
    const raw = supplied.get(field.slot);
    if (raw !== undefined) values.set(field.slot, validateValue(field, raw));
  }
  for (const field of template.fields) {
    if (!values.has(field.slot)) {
      throw new CliError(`参数 [${field.slot}] 没有可用默认值，必须填写`, 'POLICY_TEMPLATE_PARAM_REQUIRED');
    }
  }
  return values;
}

/** Commander 重复旗标的安全解析：仅在第一个 `=` 处分割，值可包含 `=`。 */
export function parseTemplateParam(value: string): TemplateParamInput {
  const index = value.indexOf('=');
  const slot = index > 0 ? Number(value.slice(0, index)) : Number.NaN;
  if (!Number.isInteger(slot) || slot < 1 || index === value.length - 1) {
    throw new CliError('--param 格式必须是 <编号>=<值>', 'POLICY_TEMPLATE_PARAM_FORMAT');
  }
  return { slot, value: value.slice(index + 1) };
}

function compiledPolicyText(result: unknown): string {
  const envelope = result as { data?: unknown };
  const data = envelope.data ?? result;
  const contract = data && typeof data === 'object'
    ? (data as Record<string, unknown>).policyTextNew
      ?? (data as Record<string, unknown>).contractNew
      ?? (data as Record<string, unknown>).policyText
      ?? (data as Record<string, unknown>).contract
    : data;
  if (typeof contract !== 'string' || !contract.trim()) {
    throw new CliError('策略模板编译结果缺少 policyTextNew', 'POLICY_TEMPLATE_COMPILE_INVALID');
  }
  // 仅兼容平台明确迁移过的关键字大小写；事件/金额/时间语义绝不做字符串猜测。
  return contract.replace(/\bfor\s+public\b/gi, 'FOR PUBLIC').replace(/\binitial\b/gi, 'Initial').trim();
}

function translatedPolicy(result: unknown): string {
  const envelope = result as { data?: unknown };
  const data = envelope.data ?? result;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data && typeof data === 'object') {
    const value = (data as Record<string, unknown>).policyReport
      ?? (data as Record<string, unknown>).translation
      ?? (data as Record<string, unknown>).text;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  throw new CliError('策略模板翻译结果为空', 'POLICY_TEMPLATE_TRANSLATION_INVALID');
}

/**
 * Console 的 translate 端点接收 Base64 策略正文；编译产物中的制表符和回车先规整为
 * 空格，换行保留。这里仅用于翻译预览，真正写入的仍是未编码的 policyText。
 */
function encodePolicyForTranslation(policyText: string): string {
  return Buffer.from(policyText.replace(/[\t\r]/g, ' '), 'utf8').toString('base64');
}

/** 平台 HTTP 错误不是 CLI 未捕获异常；保留后端可读消息并给脚本稳定错误码。 */
function policyApiFailure(stage: '编译' | '翻译', cause: unknown): never {
  if (cause instanceof CliError) throw cause;
  const message = cause instanceof Error && cause.message.trim() ? cause.message.trim() : '平台请求失败';
  throw new CliError(`策略模板${stage}失败：${message}`, stage === '编译' ? 'POLICY_TEMPLATE_COMPILE_FAILED' : 'POLICY_TEMPLATE_TRANSLATION_FAILED');
}

/** 编译与翻译不依赖资源主体；单资源和合集传入同一模板响应的 compileType。 */
export async function compilePolicyTemplate(input: {
  template: PolicyTemplate;
  params: readonly TemplateParamInput[];
  requireEveryParam: boolean;
  reCompile: (params: {
    _id: string;
    compileType: 'normal' | 'collection';
    fillArgs: Array<{ name: string; value: TemplateValue }>;
  }) => Promise<unknown>;
  translate: (params: { policyText: string; compileType: 'normal' | 'collection' }) => Promise<unknown>;
}): Promise<PreparedPolicyTemplate> {
  const values = resolveTemplateValues(input.template, input.params, input.requireEveryParam);
  let compiled: unknown;
  try {
    compiled = await input.reCompile({
      _id: input.template.id,
      compileType: input.template.compileType,
      fillArgs: input.template.fields.map((field) => ({ name: field.fieldId, value: values.get(field.slot)! })),
    });
  } catch (cause) {
    policyApiFailure('编译', cause);
  }
  const policyText = compiledPolicyText(compiled);
  let translated: unknown;
  try {
    translated = await input.translate({
      policyText: encodePolicyForTranslation(policyText),
      compileType: input.template.compileType,
    });
  } catch (cause) {
    policyApiFailure('翻译', cause);
  }
  const translation = translatedPolicy(translated);
  return { template: input.template, values, policyText, translation };
}

/** JSON 只包含可阅读/可提交的槽位，不泄露 DSL、compileType 或内部 field id。 */
export function templateJson(template: PolicyTemplate): Record<string, unknown> {
  const values = defaultTemplateValues(template);
  return {
    id: template.id,
    title: template.name,
    report: renderTemplateReport(template, values),
    ...(template.summary ? { summary: template.summary } : {}),
    fingerprint: template.fingerprint,
    parameters: template.fields.map((field) => ({
      slot: field.slot,
      type: field.type,
      ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
      required: field.defaultValue === undefined,
      ...(field.numberRule ? { numberRule: field.numberRule } : {}),
      options: field.options.map((option) => ({ value: option.value, label: option.label })),
    })),
  };
}
