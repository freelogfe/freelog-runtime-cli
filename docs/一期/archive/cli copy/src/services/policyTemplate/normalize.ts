import type {
  PolicyTemplateInput,
  PolicyTemplateInputType,
  PolicyTemplateSummary,
} from './types.js';
import { isRecord } from './utils.js';

interface PolicyTemplateApiInput {
  id: string;
  uiSectionType?: 'number' | 'select';
  uiSectionDefaultValue?: string | number;
  selectOptions?: Array<{ label: string; value: string }>;
}

export interface PolicyTemplateApiItem {
  _id: string;
  title: string;
  template: string;
  reportTranslate: string;
  report: string;
  reportUiTemplate?: PolicyTemplateApiInput[];
}

export function extractTemplateData(envelope: unknown): PolicyTemplateApiItem[] {
  if (!isRecord(envelope) || !Array.isArray(envelope.data)) return [];
  return envelope.data as PolicyTemplateApiItem[];
}

function normalizeTemplateInput(input: PolicyTemplateApiInput): PolicyTemplateInput {
  const type: PolicyTemplateInputType =
    input.uiSectionType === 'number'
      ? 'number'
      : input.uiSectionType === 'select'
        ? 'select'
        : 'datetime';
  const isRelativeTimeEvent = input.id.includes('.RelativeTimeEvent');
  return {
    name: input.id,
    type,
    defaultValue: input.uiSectionDefaultValue,
    min: type === 'number' ? (isRelativeTimeEvent ? 1 : 0.01) : undefined,
    precision: type === 'number' ? (isRelativeTimeEvent ? 0 : 2) : undefined,
    options: input.selectOptions ?? [],
  };
}

/** Console Builder 只把 report 里的变量暴露为可编辑参数；CLI 保持同一输入集合。 */
function extractInputsFromReport(template: PolicyTemplateApiItem): PolicyTemplateInput[] {
  const uiById = new Map((template.reportUiTemplate ?? []).map((item) => [item.id, item]));
  const ids = [...template.report.matchAll(/\$\{([^}]+)\}/g)].map((match) => match[1]!.trim());
  return [...new Set(ids)]
    .map((id) => uiById.get(id) ?? { id })
    .map((item) => normalizeTemplateInput(item));
}

export function normalizePolicyTemplate(item: PolicyTemplateApiItem): PolicyTemplateSummary {
  return {
    id: item._id,
    title: item.title,
    code: item.template,
    translation: item.reportTranslate,
    inputs: extractInputsFromReport(item),
  };
}
