import apiClient from "../core/http";

/**
 * 支付事件参数
 */
export interface PaymentEventBody {
  /** 事件 ID */
  eventId: string;
  
  /** 付款账户 */
  accountId: string;
  
  /** 付款金额（最多保留两位小数） */
  transactionAmount: number;
  
  /** 账户支付密码（6位数字） */
  password: string;
}

/**
 * 支付事件响应
 */
export interface PaymentEventResponse {
  /** 交易记录 ID */
  transactionRecordId: string;
  
  /** 交易状态：1-交易确认中 2-交易成功 3-交易取消 4-交易失败 */
  status: 1 | 2 | 3 | 4;
  
  /** 交易失败时的错误码 */
  code?: string;
}

/**
 * 个人账户信息
 */
export interface IndividualAccountInfo {
  /** 账户 ID */
  accountId: string;
  
  /** 账户名称 */
  accountName: string;
  
  /** 账户类型：1-个人 2-合约 3-节点 4-组织或公司 */
  accountType: 1 | 2 | 3 | 4;
  
  /** 账户所有者 ID */
  ownerId: string;
  
  /** 账户所属者名称 */
  ownerName: string;
  
  /** 账户所属者用户 ID */
  ownerUserId: number;
  
  /** 余额 */
  balance: string;
  
  /** 冻结的金额 */
  freezeBalance: string;
  
  /** 状态：0-未激活 1-正常 2-冻结 */
  status: 0 | 1 | 2;
  
  /** 创建时间 */
  createDate: string;
  
  /** 账户数据最后更新时间 */
  updateDate: string;
}

/**
 * 查看用户个人账户信息
 * 
 * @param userId 当前登录用户 ID
 * @returns 个人账户信息
 * 
 * @see https://doc.freelog.com/payV2/%E6%9F%A5%E7%9C%8B%E7%94%A8%E6%88%B7%E4%B8%AA%E4%BA%BA%E8%B4%A6%E6%88%B7%E4%BF%A1%E6%81%AF.html
 */
export function getIndividualAccount(userId: number): Promise<IndividualAccountInfo> {
  return apiClient.get(`/v2/accounts/individualAccounts/${userId}`);
}

/**
 * 合同事件处理 - 交易事件
 * 
 * @param contractId 合同 ID
 * @param body 支付事件参数
 * @returns 支付响应
 * 
 * @see https://doc.freelog.com/contract-event-v2/%E4%BA%A4%E6%98%93%E4%BA%8B%E4%BB%B6.html
 */
export function executePaymentEvent(
  contractId: string,
  body: PaymentEventBody
): Promise<PaymentEventResponse> {
  return apiClient.post(`/v2/contracts/${contractId}/events/payment`, body);
}

/**
 * 支付错误码说明
 */
export const PaymentErrorCodes = {
  E1002: "认证错误",
  E1003: "授权错误",
  E1004: "交易账户未找到",
  E1005: "交易账户未激活",
  E1006: "交易账户被冻结",
  E1007: "交易类型校验失败",
  E1008: "交易账户数据签名校验失败",
  E1009: "余额不足",
  E1010: "交易密码错误",
  E1011: "合约账户交易签名校验失败",
  E1012: "组织账户交易签名校验失败",
  E1013: "发起方账户与收款方账户一致错误",
  E1014: "交易被重复确认",
  E1015: "交易金额校验失败",
  E1016: "交易记录数据未找到",
  E1017: "交易记录签名验证失败",
  E1999: "其他未明确定义的错误",
} as const;

/**
 * 获取支付错误码对应的错误信息
 */
export function getPaymentErrorMessage(code?: string): string {
  if (!code) return "未知错误";
  return PaymentErrorCodes[code as keyof typeof PaymentErrorCodes] || `未知错误码: ${code}`;
}

