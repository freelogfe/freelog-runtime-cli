/**
 * 策略和翻译模板相关 API
 * @see https://doc.freelog.com/translate/%E7%BF%BB%E8%AF%91%E6%A8%A1%E6%9D%BF%E6%8E%A5%E5%8F%A3%E6%96%87%E6%A1%A3.html
 */

import { freelogRequest } from "../core/http";

export interface PolicyTemplatesResponse {
  _id: string;
  title: string;
  template: string;
  reportTranslate: string;
  report: string;
  reportUiTemplate: {
    id: string;
    type: string;
    uiSectionDefaultValue: string | number;
    uiSectionType: "number" | "select";
    selectOptions: {
      label: string;
      value: string;
    }[];
  }[];
}

/**
 * 列出奖励模板（客户端）
 * @param params 查询参数
 * @see https://doc.freelog.com/translate/%E7%BF%BB%E8%AF%91%E6%A8%A1%E6%9D%BF%E6%8E%A5%E5%8F%A3%E6%96%87%E6%A1%A3.html
 */
export async function policyTemplates(): Promise<PolicyTemplatesResponse[]> {
  return freelogRequest.get<PolicyTemplatesResponse[]>(
    "/v2/translate/translate-config/list4Client"
  );
}

export interface PolicyTemplateInfo {
  id: string;
  title: string;
  code: string;
  translation: string;
  displayData: DisplayItem[];
  report?: string; // 包含 ${id} 占位符的报告文本
  reportUiTemplate?: {
    id: string;
    type: string;
    uiSectionDefaultValue: string | number;
    uiSectionType: "number" | "select";
    selectOptions: {
      label: string;
      value: string;
    }[];
  }[]; // UI 模板数组，用于匹配 report 中的占位符
}

export interface DisplayItem {
  id: string; // 唯一标识，用于寻找在策略模板和翻译模版中替换填充的位置
  type:
    | "text" // 文本
    | "number" // 数字
    | "datetime" // 日期时间
    | "select"; // 选择;
  text?: {
    value: string; // 展示的文字
  };
  number?: {
    value: number; // 填充的数字
    min?: number; // 最小值
    max?: number; // 最大值
    precision?: number; // 小数位数
  };
  datetime?: {
    value: string; // 填充的日期时间，格式:YY-MM-DD HH:mm
    minDatetime?: string; // 最小日期（包含），同样会限制面板的切换范围，格式：YYYY-MM-DD HH:mm
    maxDatetime?: string; // 最大日期（包含），同样会限制面板的切换范围，格式：YYYY-MM-DD HH:mm
  };
  select?: {
    value: string; // 填充的选项
    options: {
      label: string; // 展示的文字
      value: string; // 填充的值
    }[];
  };
}

// ==================== 策略相关接口 ====================

/**
 * 批量获取授权策略列表查询参数
 */
export interface PoliciesParams {
  /** 页码（可选） */
  page?: number;
  /** 每页数量（可选） */
  pageSize?: number;
  /** 标的物类型（可选，1:资源 2:展品 3:用户组） */
  subjectType?: 1 | 2 | 3;
  /** 投影字段（可选） */
  projection?: string;
}

/**
 * 批量获取授权策略列表
 * @param params 查询参数
 */
export async function policies(params?: PoliciesParams): Promise<any> {
  return freelogRequest.get("/v2/policies", { params });
}

/**
 * 批量获取授权策略列表（通过策略ID）查询参数
 */
export interface PoliciesListParams {
  /** 策略ID列表（必选，逗号分隔的字符串） */
  policyIds: string;
  /** 标的物类型（可选） */
  subjectType?: number;
  /** 用户ID（可选） */
  userId?: number;
  /** 投影字段（可选） */
  projection?: string;
}

/**
 * 批量获取授权策略列表（通过策略ID）
 * @param params 查询参数
 */
export async function policiesList(params: PoliciesListParams): Promise<any> {
  return freelogRequest.get("/v2/policies/list", { params });
}

/**
 * 重新编译策略请求体
 */
export interface PolicyReCompileBody {
  /** 模板ID（可选，若填写该参数，则从模板库取策略） */
  _id?: string;
  /** 待编译的策略，base64编码（可选） */
  contract?: string;
  /** 填充参数（必选） */
  fillArgs: Array<{
    /** 参数名 */
    name: string;
    /** 参数值 */
    value: string | number;
  }>;
}

/**
 * 重新编译策略响应
 */
export interface PolicyReCompileResponse {
  /** 新策略 */
  contractNew: string;
}

/**
 * 重新编译策略
 * @param body 重新编译策略请求体
 */
export async function policyReCompile(
  body: PolicyReCompileBody
): Promise<PolicyReCompileResponse> {
  return freelogRequest.post<PolicyReCompileResponse>(
    "/v2/translate/reCompile",
    body
  );
}

/**
 * 模板策略翻译请求体
 */
export interface PolicyTranslationBody {
  /** 待翻译的策略，base64编码（必选） */
  contract: string;
}

/**
 * 模板策略翻译
 * @param body 模板策略翻译请求体
 * @returns 翻译后的文本（字符串）
 * @see https://doc.freelog.com/translate/%E7%BF%BB%E8%AF%91%E6%A8%A1%E6%9D%BF%E6%8E%A5%E5%8F%A3%E6%96%87%E6%A1%A3.html
 */
export async function policyTranslation(
  body: PolicyTranslationBody
): Promise<string> {
  // API 返回格式: { ret: 0, data: "翻译后的文本" }
  // freelogRequest.post 已经提取了 data 字段，所以直接返回字符串
  return freelogRequest.post<string>(
    "/v2/translate/translate",
    body
  );
}

/**
 * FSM 扭转记录
 */
export interface FsmTransfer {
  /** 扭转记录ID号（可选） */
  id?: any;
  /** 当前状态 */
  state: string;
  /** 从哪里来 */
  fromState: string;
  /** 到哪里去（和state相同） */
  toState: string;
  /** 是否是最后一条扭转记录（可选） */
  isLast?: boolean;
  /** 发生时间 */
  time: string;
  /** 由哪个事件触发扭转 */
  event: {
    /** 事件代码（可选） */
    code?: string;
    /** 事件名 */
    name: string;
    /** 事件参数（可选） */
    args?: Record<string, any>;
    /** 事件目标状态（可选） */
    toState?: string;
  };
}

/**
 * 模板策略扭转记录翻译请求体
 */
export interface PolicyTransferTranslationBody {
  /** 待翻译的策略，base64编码（必选） */
  contract: string;
  /** 扭转过程（必选） */
  fsmTransfers: FsmTransfer[];
}

/**
 * 事件段落实体
 */
export interface EventSectionEntity {
  /** 原始事件信息 */
  origin: {
    /** 目标状态 */
    toState: string;
    /** 服务名称 */
    service: string;
    /** 事件名称 */
    name: string;
    /** 事件参数 */
    args: Record<string, any>;
    /** 事件代码 */
    code: string;
    /** 事件描述 */
    description: string;
    /** 是否单例 */
    isSingleton: boolean;
    /** 事件ID */
    id: string;
  };
  /** 翻译内容 */
  content: string;
}

/**
 * FSM 扭转结果
 */
export interface FsmTransferResult {
  /** 服务状态 */
  serviceStates: number;
  /** 时间 */
  time: string;
  /** 状态字符串 */
  stateStr: string;
  /** 状态信息字符串 */
  stateInfoStr: string;
  /** 事件字符串 */
  eventStr: string;
  /** 事件选择字符串 */
  eventSelectStr: string;
  /** 事件段落字符串列表 */
  eventSectionStrs: string[];
  /** 事件段落实体列表 */
  eventSectionEntities: EventSectionEntity[];
}

/**
 * 模板策略扭转记录翻译响应
 */
export interface PolicyTransferTranslationResponse {
  /** FSM 扭转结果列表 */
  fsmTransferResults: FsmTransferResult[];
  /** 完整翻译内容 */
  content: string;
}

/**
 * 模板策略扭转记录翻译
 * @param body 模板策略扭转记录翻译请求体
 */
export async function policyTransferTranslation(
  body: PolicyTransferTranslationBody
): Promise<PolicyTransferTranslationResponse> {
  return freelogRequest.post<PolicyTransferTranslationResponse>(
    "/v2/translate/transfer",
    body
  );
}
