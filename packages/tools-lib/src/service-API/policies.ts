// import {Base64} from 'js-base64';
import FUtil from '../utils';

// 批量获取授权策略列表
interface PoliciesParamsType {
  page?: number;
  pageSize?: number;
  subjectType?: 1 | 2 | 3; // 1:资源 2:展品 3:用户组
  projection?: string;
}

export function policies(params: PoliciesParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/policies`,
    params: params,
  });
}

// 批量获取授权策略列表
interface PoliciesListParamsType {
  policyIds: string;
  subjectType?: number;
  userId?: number;
  projection?: string;
}

export function policiesList(params: PoliciesListParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/policies/list`,
    params: params,
  });
}

// 策略模板
interface PolicyTemplatesParamsType {
  resourceTypeCodes4Resource?: string[];
  resourceTypeCodes4Presentable?: string[];
}

export function policyTemplates(params: PolicyTemplatesParamsType = {}) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/translate/cg/translate-config/list4Client`,
    data: params,
  });
}

/** CG 编译目标：普通资源策略或合集策略。 */
export type CgCompileType = 'normal' | 'collection';

// 重新编译
interface PolicyReCompileParamsType {
  _id?: string;
  policyText?: string;
  contract?: string;
  compileType?: CgCompileType;
  fillArgs: {
    name: string;
    value: string | number | boolean;
  }[];
}

/** CG 接口只接受 `${name}` 形式；兼容上层仍传裸变量名。 */
function toCgFillArgName(name: string): string {
  const trimmed = String(name || '');
  if (!trimmed) return trimmed;
  return trimmed.startsWith('${') ? trimmed : `\${${trimmed}}`;
}

export function policyReCompile(data: PolicyReCompileParamsType) {
  const { contract, policyText, fillArgs, ...rest } = data;
  return FUtil.Request({
    method: 'POST',
    url: `/v2/translate/cg/reCompile`,
    data: {
      ...rest,
      policyText: policyText ?? contract,
      fillArgs: (fillArgs ?? []).map((arg) => ({
        ...arg,
        name: toCgFillArgName(arg.name),
      })),
    },
  });
}

// 模板策略翻译
interface PolicyTranslationParamsType {
  policyText?: string;
  contract?: string;
  compileType: CgCompileType;
}

export function policyTranslation({
  contract,
  policyText,
  compileType,
}: PolicyTranslationParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/translate/cg/translate`,
    data: {
      policyText: policyText ?? contract,
      compileType,
    },
  });
}

// 模板策略翻译
interface PolicyTransferTranslationParamsType {
  contract: string;
  fsmTransfers: any;
}

export function policyTransferTranslation(params: PolicyTransferTranslationParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/translate/transfer`,
    data: params,
  });
}
