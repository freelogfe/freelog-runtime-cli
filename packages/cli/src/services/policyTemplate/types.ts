export type PolicyTemplateInputType = 'number' | 'select' | 'datetime';

export interface PolicyTemplateInput {
  name: string;
  type: PolicyTemplateInputType;
  defaultValue?: string | number;
  min?: number;
  precision?: number;
  options: Array<{ label: string; value: string }>;
}

export interface PolicyTemplateSummary {
  id: string;
  title: string;
  code: string;
  translation: string;
  inputs: PolicyTemplateInput[];
}

export interface PolicyTemplateParam {
  name: string;
  value: string | number;
}

export interface AppliedTemplatePolicy {
  templateId: string;
  policyName: string;
  policyText: string;
  translation: string;
}

export interface PolicyTemplatePreview extends AppliedTemplatePolicy {
  templateTitle: string;
  params: PolicyTemplateParam[];
  codeDigest: string;
}
