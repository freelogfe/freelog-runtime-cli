/**
 * 合约相关 API
 */

import { freelogRequest } from "../core/http";
import type { PolicyInfo } from "./types";

/**
 * 批量创建合同请求体
 * @see https://doc.freelog.com/contractV2/%E6%89%B9%E9%87%8F%E5%88%9B%E5%BB%BA%E5%90%88%E5%90%8C.html
 */
export interface BatchSignContractBody {
  /** 标的物集合 */
  subjects: Array<{
    /** 标的物ID（资源ID） */
    subjectId: string;
    /** 标的物的策略ID */
    policyId: string;
    /** 标的物类型：1-资源 2-展品 3-用户组 */
    subjectType: 1 | 2 | 3;
  }>;

  /** 乙方ID */
  licenseeId: string;

  /** 乙方身份类型：1-资源方 2-节点方 3-C端用户 */
  licenseeIdentityType: 1 | 2 | 3;
}

/**
 * 合约信息响应
 */
export interface ContractResponse {
  /** 合约 ID */
  contractId: string;

  /** 合约名称 */
  contractName: string;

  /** 许可方 ID（甲方ID，资源所有者 ID） */
  licensorId: string;

  /** 许可方名称（甲方名称） */
  licensorName: string;

  /** 甲方所属用户ID */
  licensorOwnerId: number;

  /** 甲方所属用户名称 */
  licensorOwnerName: string;

  /** 被许可方 ID（乙方ID） */
  licenseeId: string;

  /** 被许可方名称（乙方名称） */
  licenseeName: string;

  /** 乙方所属用户ID */
  licenseeOwnerId: number;

  /** 乙方所属用户名称 */
  licenseeOwnerName: string;

  /** 乙方身份类型 */
  licenseeIdentityType: 1 | 2 | 3;

  /** 标的物 ID（资源 ID） */
  subjectId: string;

  /** 标的物名称（资源名称） */
  subjectName: string;

  /** 标的物类型：1-资源 2-展品 3-用户组 */
  subjectType: 1 | 2 | 3;

  /** 策略 ID */
  policyId: string;

  /** 是否是默认执行合同 */
  isDefault: boolean;

  /** 当前状态机状态名称 */
  fsmCurrentState: string;

  /** 状态机运行状态：1-未初始化 2-系统锁定状态 4-生效中(已初始化,未终止) 8-已终止 */
  fsmRunningStatus: 1 | 2 | 4 | 8;

  /** 合同授权状态：1-正式授权 2-测试授权 128-未获得授权 */
  authStatus: 1 | 2 | 128;

  /** 合同综合状态：0-正常 1-已终止 2-异常 */
  status: 0 | 1 | 2;

  /** 创建日期 */
  createDate: string;

  /** 更新日期 */
  updateDate: string;
}

/**
 * 批量创建合同（签约）
 *
 * @param body 批量签约请求体
 * @returns 合约列表
 *
 * @see https://doc.freelog.com/contractV2/%E6%89%B9%E9%87%8F%E5%88%9B%E5%BB%BA%E5%90%88%E5%90%8C.html
 */
export async function batchSignContracts(
  body: BatchSignContractBody
): Promise<ContractResponse[]> {
  return freelogRequest.post("/v2/contracts/batchSign", body);
}

/**
 * 创建单个合约（简化版，内部调用批量接口）
 *
 * @param subjectId 标的物ID（资源ID）
 * @param policyId 策略ID
 * @param licenseeId 乙方ID
 * @returns 合约信息
 *
 * @see https://doc.freelog.com/contractV2/%E6%89%B9%E9%87%8F%E5%88%9B%E5%BB%BA%E5%90%88%E5%90%8C.html
 */
export async function createContract(
  subjectId: string,
  policyId: string,
  licenseeId: string
): Promise<ContractResponse> {
  const body: BatchSignContractBody = {
    subjects: [{ subjectId, subjectType: 1, policyId }],
    // 资源
    licenseeId: licenseeId, // 
    licenseeIdentityType: 1, // C端用户
  };

  const contracts = await batchSignContracts(body);
  return contracts[0];
}

/**
 * 查看合约详情
 *
 * @param contractId 合约 ID
 * @returns 合约详情
 *
 * @see https://doc.freelog.com/contractV2/%E6%9F%A5%E7%9C%8B%E5%90%88%E7%BA%A6%E8%AF%A6%E6%83%85.html
 */
export async function getContractInfo(
  contractId: string
): Promise<ContractResponse> {
  return freelogRequest.get(`/v2/contracts/${contractId}`);
}

/**
 * 批量查询合同列表查询参数
 * 
 * 注意: contractIds 和 subjectIds 最少需要一项
 */
export interface GetContractsListParams {
  /** 合同ID，多个用逗号分隔（可选，但 contractIds 和 subjectIds 至少需要一项） */
  contractIds?: string;
  /** 签约对象ID，多个用逗号分割（可选，但 contractIds 和 subjectIds 至少需要一项） */
  subjectIds?: string;
  /** 标的物类型（可选，1:资源 2:展品 3:用户组） */
  subjectType?: 1 | 2 | 3;
  /** 乙方身份类型（可选，1:资源方 2:节点方 3:C端用户） */
  licenseeIdentityType?: 1 | 2 | 3;
  /** 甲方ID（可选） */
  licensorId?: string;
  /** 乙方ID（可选） */
  licenseeId?: string;
  /** 合约状态过滤（可选，0:正常合约 1:已终止合约 2:异常合约，默认全部） */
  contractStatus?: 0 | 1 | 2;
  /** 是否加载策略详情信息（可选，0:否(默认) 1:是） */
  isLoadPolicyInfo?: 0 | 1;
  /** 是否翻译策略（可选，需要主动加载策略，0:否 1:是） */
  isTranslate?: 0 | 1;
  /** 返回字段筛选，多个用逗号分隔（可选） */
  projection?: string;
}

/**
 * 批量查询合同列表
 *
 * @param params 查询参数（contractIds 和 subjectIds 至少需要一项）
 * @returns 合同列表
 *
 * @see https://doc.freelog.com/contractV2/%E6%89%B9%E9%87%8F%E6%9F%A5%E8%AF%A2%E5%90%88%E5%90%8C%E5%88%97%E8%A1%A8.html
 */
export async function getContractsList(
  params: GetContractsListParams
): Promise<ContractResponse[]> {
  // 验证：contractIds 和 subjectIds 至少需要一项
  if (!params.contractIds && !params.subjectIds) {
    throw new Error("contractIds 和 subjectIds 至少需要一项");
  }
  
  return freelogRequest.get<ContractResponse[]>(`/v2/contracts/list`, {
    params,
  });
}

/**
 * 批量查询合约详情（简化版，内部调用 getContractsList）
 *
 * @param contractIds 合约 ID，多个用逗号分隔
 * @param options 可选参数
 * @returns 合约列表
 *
 * @see https://doc.freelog.com/contractV2/%E6%89%B9%E9%87%8F%E6%9F%A5%E8%AF%A2%E5%90%88%E7%BA%A6%E8%AF%A6%E6%83%85.html
 */
export async function getBatchContracts(
  contractIds: string,
  options?: {
    /** 是否加载策略详情信息（可选，0:否(默认) 1:是） */
    isLoadPolicyInfo?: 0 | 1;
    /** 是否翻译策略（可选，需要主动加载策略，0:否 1:是） */
    isTranslate?: 0 | 1;
    /** 返回字段筛选，多个用逗号分隔（可选） */
    projection?: string;
  }
): Promise<ContractResponse[]> {
  return getContractsList({
    contractIds,
    isLoadPolicyInfo: options?.isLoadPolicyInfo,
    isTranslate: options?.isTranslate,
    projection: options?.projection,
  });
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
 * 合约流转记录响应
 */
export interface ContractTransitionRecord {
  /** 记录ID */
  id: string;

  /** 色块码 1：授权 2：测试授权 3：授权且测试授权 128：无授权 */
  serviceStates: number;

  /** 时间 */
  time: string;

  /** 状态翻译 */
  stateStr: string;

  /** 状态信息翻译 */
  stateInfoStr: string;

  /** 当前事件翻译 */
  eventStr: string;

  /** 事件选项提示语 */
  eventSelectStr: string;

  /** 事件选项翻译 */
  eventSectionStrs: string[];

  /** 事件选项实体 */
  eventSectionEntities: EventSectionEntity[];

  /** 合约ID */
  contractId: string;

  /** 该合约的总的记录数 */
  total: number;
}

/**
 * 多个合约的最新流转记录请求体
 */
export interface ContractsTransitionRecordBody {
  /** 合约ID数组（必选） */
  contractIds: string[];

  /** 是否翻译（可选，默认true） */
  isTranslate?: boolean;
}

/**
 * 多个合约的最新流转记录
 *
 * @param body 请求体
 * @returns 合约流转记录列表
 *
 * @see https://doc.freelog.com/contractV2/%E5%A4%9A%E4%B8%AA%E5%90%88%E7%BA%A6%E7%9A%84%E6%9C%80%E6%96%B0%E6%B5%81%E8%BD%AC%E8%AE%B0%E5%BD%95.html
 */
export async function getContractsTransitionRecord(
  body: ContractsTransitionRecordBody
): Promise<ContractTransitionRecord[]> {
  return freelogRequest.post<ContractTransitionRecord[]>(
    "/v2/contracts/contractsTransitionRecord",
    body
  );
}