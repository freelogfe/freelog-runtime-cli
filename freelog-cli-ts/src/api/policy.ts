/**
 * 策略相关 API
 * 包括策略编译、翻译、路由解析等功能
 * @see https://doc.freelog.com/%E7%AD%96%E7%95%A5/%E7%AD%96%E7%95%A5.html
 */

import { freelogRequest } from "../core/http";

/**
 * 状态机（StateMachine）
 */
export interface StateMachine {
  /** 受众信息 */
  audiences?: Array<{
    name: string;
    type: string;
  }>;
  /** 声明信息 */
  declarations?: {
    serviceStates?: Array<{
      name: string;
      type: string;
    }>;
  };
  /** 状态定义 */
  states?: Record<
    string,
    {
      transitions?: Transition[];
      serviceStates?: string[];
      isInitial?: boolean;
    }
  >;
  /** 描述信息 */
  description?: {
    symbolArgs?: {
      envArgs?: string[];
    };
  };
}

/**
 * 转换（Transition）
 */
export interface Transition {
  /** 目标状态 */
  toState: string;
  /** 服务名称 */
  service: string;
  /** 事件名称 */
  name: string;
  /** 事件参数 */
  args?: Record<string, any>;
  /** 事件代码 */
  code?: string;
  /** 事件描述 */
  description?: string;
  /** 是否单例 */
  isSingleton?: boolean;
}

/**
 * 受众信息（翻译结果）
 */
export interface AudienceInfo {
  /** 原始信息 */
  origin: {
    name: string;
    type: string;
  };
  /** 翻译内容 */
  content: string;
}

/**
 * 状态信息（翻译结果）
 */
export interface StateInfo {
  /** 原始状态名 */
  origin: string;
  /** 翻译内容 */
  content: string;
}

/**
 * 服务状态信息（翻译结果）
 */
export interface ServiceStateInfo {
  /** 原始状态名 */
  origin: string;
  /** 翻译内容 */
  content: string;
}

/**
 * 普通事件原始信息
 */
export interface NormalEventOrigin {
  /** 目标状态 */
  toState: string;
  /** 服务名称 */
  service: string;
  /** 事件名称 */
  name: string;
  /** 事件参数 */
  args?: Record<string, any>;
  /** 事件代码 */
  code?: string;
  /** 事件描述 */
  description?: string;
  /** 是否单例 */
  isSingleton?: boolean;
}

/**
 * 终止事件原始信息
 */
export interface TerminateEventOrigin {
  /** 事件名称（固定为 "terminate"） */
  name: "terminate";
}

/**
 * 事件翻译信息
 */
export interface EventTranslateInfo {
  /** 原始事件信息（普通事件或终止事件） */
  origin: NormalEventOrigin | TerminateEventOrigin;
  /** 翻译内容 */
  content: string;
}

/**
 * 状态机信息（翻译结果）
 */
export interface FSMInfo {
  /** 状态信息 */
  stateInfo: StateInfo;
  /** 服务状态信息列表 */
  serviceStateInfos: ServiceStateInfo[];
  /** 事件翻译信息列表 */
  eventTranslateInfos: EventTranslateInfo[];
}

/**
 * 策略翻译响应
 */
export interface PolicyTranslateResponse {
  /** 受众信息列表 */
  audienceInfos: AudienceInfo[];
  /** 状态机信息列表 */
  fsmInfos: FSMInfo[];
  /** 完整翻译内容 */
  content: string;
}

/**
 * 策略翻译
 * @param contract 策略状态机（即 compile 接口返回值中的 state_machine 字段）
 * @see https://doc.freelog.com/%E7%AD%96%E7%95%A5/%E7%AD%96%E7%95%A5.html
 */
export async function translatePolicy(
  contract: StateMachine
): Promise<PolicyTranslateResponse> {
  return freelogRequest.post<PolicyTranslateResponse>(
    "/v2/policies/report",
    { contract }
  );
}

/**
 * FSM 路由元素
 */
export interface FSMRouteElement {
  /** 状态名 */
  state: string;
  /** 服务状态列表 */
  serviceStates: string[];
  /** 事件实体 */
  event: {
    id?: string;
    name: string;
    args?: Record<string, any>;
    state?: string;
  };
}

/**
 * 比较路由参数选项
 */
export interface CompareRoutesOptions {
  /** 是否做参数校验（0:否 1:是） */
  eventArgs?: number;
  /** 是否做色块校验（0:否 1:是 2:包含） */
  serviceStates?: number;
}

/**
 * 扭转记录翻译请求体
 */
export interface TransferTranslateBody {
  /** 状态机 */
  states: StateMachine;
  /** 路由元素A */
  routes: FSMRouteElement[][];
  /** 路由元素B */
  routesB: FSMRouteElement[][];
  /** 比较路由参数选项（可选） */
  options?: CompareRoutesOptions;
}

/**
 * 扭转记录翻译响应
 */
export interface TransferTranslateResponse {
  /** 翻译结果 */
  result: string;
}

/**
 * 扭转记录翻译
 * @param body 扭转记录翻译请求体
 * @see https://doc.freelog.com/%E7%AD%96%E7%95%A5/%E7%AD%96%E7%95%A5.html
 */
export async function translateTransfer(
  body: TransferTranslateBody
): Promise<TransferTranslateResponse> {
  return freelogRequest.post<TransferTranslateResponse>(
    "/v2/policies/transfer",
    body
  );
}

/**
 * 解析路由请求体
 */
export interface ParseRoutesBody {
  /** 状态机（就是编译结果中的状态机） */
  states: StateMachine;
  /** 起始状态名 */
  stateName: string;
  /** 路由集合（结果） */
  routes: FSMRouteElement[][];
  /** 路由 */
  route: FSMRouteElement[];
}

/**
 * 解析路由响应
 */
export interface ParseRoutesResponse {
  /** 解析后的路由集合 */
  routes: FSMRouteElement[][];
}

/**
 * 解析路由
 * @param body 解析路由请求体
 * @see https://doc.freelog.com/%E7%AD%96%E7%95%A5/%E7%AD%96%E7%95%A5.html
 */
export async function parseRoutes(
  body: ParseRoutesBody
): Promise<ParseRoutesResponse> {
  return freelogRequest.post<ParseRoutesResponse>(
    "/v2/policies/parseRoutes",
    body
  );
}

/**
 * 编译策略请求体
 */
export interface CompilePolicyBody {
  /** 编译文本 */
  policyText: string;
  /** 标的物类型 */
  targetType: string;
  /** 远端地址 */
  targetUrl: string;
  /** 环境：dev|prod */
  env: "dev" | "prod";
}

/**
 * 编译策略响应
 */
export interface CompilePolicyResponse {
  /** 状态机 */
  state_machine: StateMachine;
  /** 警告列表 */
  warnings: string[];
  /** 警告对象列表 */
  warningObjects: any[];
  /** 错误列表 */
  errors: string[];
  /** 错误对象列表 */
  errorObjects: any[];
}

/**
 * 编译策略
 * @param body 编译策略请求体
 * @see https://doc.freelog.com/%E7%AD%96%E7%95%A5/%E7%AD%96%E7%95%A5.html
 */
export async function compilePolicy(
  body: CompilePolicyBody
): Promise<CompilePolicyResponse> {
  return freelogRequest.post<CompilePolicyResponse>(
    "/v2/policies/compile",
    body
  );
}

