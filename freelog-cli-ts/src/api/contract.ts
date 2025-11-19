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
  }>;
  
  /** 标的物类型：1-资源 2-展品 3-用户组 */
  subjectType: 1 | 2 | 3;
  
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
export async function batchSignContracts(body: BatchSignContractBody): Promise<ContractResponse[]> {
  return freelogRequest.post('/v2/contracts/batchSign', body);
}

/**
 * 创建单个合约（简化版，内部调用批量接口）
 * 
 * @param subjectId 标的物ID（资源ID）
 * @param policyId 策略ID
 * @param licenseeId 乙方ID（可选，默认使用当前用户）
 * @returns 合约信息
 * 
 * @see https://doc.freelog.com/contractV2/%E6%89%B9%E9%87%8F%E5%88%9B%E5%BB%BA%E5%90%88%E5%90%8C.html
 */
export async function createContract(
  subjectId: string,
  policyId: string,
  licenseeId?: string
): Promise<ContractResponse> {
  const body: BatchSignContractBody = {
    subjects: [{ subjectId, policyId }],
    subjectType: 1, // 资源
    licenseeId: licenseeId || '', // 如果不传，后端会使用当前用户
    licenseeIdentityType: 3, // C端用户
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
export async function getContractInfo(contractId: string): Promise<ContractResponse> {
  return freelogRequest.get(`/v2/contracts/${contractId}`);
}

/**
 * 批量查询合约详情
 * 
 * @param contractIds 合约 ID 数组（逗号分隔）
 * @returns 合约列表
 * 
 * @see https://doc.freelog.com/contractV2/%E6%89%B9%E9%87%8F%E6%9F%A5%E8%AF%A2%E5%90%88%E7%BA%A6%E8%AF%A6%E6%83%85.html
 */
export async function getBatchContracts(contractIds: string): Promise<ContractResponse[]> {
  return freelogRequest.get(`/v2/contracts/list`, { contractIds });
}

