import { AxiosRequestConfig } from 'axios';
import FUtil from '../utils';
import { getPlatform } from '../platform/runtime';

type UploadBody = Blob | ArrayBuffer | ArrayBufferView;

function createFormData(params: Record<string, unknown>): FormData {
  const createPlatformFormData = getPlatform().createFormData;
  if (createPlatformFormData) return createPlatformFormData(params);
  const formData = new FormData();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      formData.append(key, value as string | Blob);
    }
  }
  return formData;
}

// 证件上传与识别
interface UploadIDCardParamsType {
  file: UploadBody;
}

export function uploadIDCard(params: UploadIDCardParamsType, config?: AxiosRequestConfig) {
  const formData = createFormData(params as unknown as Record<string, unknown>);
  return FUtil.Request({
    method: 'POST',
    url: `/v3/transactions/accounts/idCardUploadAndOcr`,
    data: formData,
    ...config,
  });
}


// 开通金融账户
interface OpenFinancialAccountParamsType {
  accountType: 1 | 2; // 账户类型(1:个人账户 2:节点账户)
  ownerId: number; // 账户所有者ID; 根据账户类型动态赋值userId或nodeId
  certType: '00'; // 证件类型(00:身份证)
  certNo: string; // 证件号码;例如身份证号
  name: string; // 证件上的名称;例如身份证上的姓名
  certValidityType: 0 | 1;  // 证件有效期是否是长期; 0:非长期有效 1:长期有效
  certBeginDate: string; // 证件有效期开始日期
  certEndDate?: string; // 证件有效期结束日期(长期有效时此处不传)
  mobile: string; // 开户人真实手机号;
  certImagePaths: string[]; // 证件照保密存放的path部分; 身份证号码识别接口会返回
}

export function openFinancialAccount(params: OpenFinancialAccountParamsType, config?: AxiosRequestConfig) {
  return FUtil.Request({
    method: 'POST',
    url: `/v3/transactions/accounts`,
    data: params,
    ...config,
  });
}


// 修改金融账户信息
interface UpdateFinancialAccountParamsType {
  accountId: string; // 金融账户ID
  certNo: string; // 证件号码;例如身份证号
  name: string; // 证件上的名称;例如身份证上的姓名
  certValidityType: 0 | 1; // 证件有效期是否是长期; 0:非长期有效 1:长期有效
  certBeginDate: string; // 证件有效期开始日期
  certEndDate?: string; // 证件有效期结束日期(长期有效时此处不传)
  certImagePaths: string[]; // 证件照保密存放的path部分; 身份证号码识别接口会返回
}

export function updateFinancialAccount({accountId, ...params}: UpdateFinancialAccountParamsType, config?: AxiosRequestConfig) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v3/transactions/accounts/${accountId}`,
    data: params,
    ...config,
  });
}

// 金融账户绑定提现卡
interface BindWithdrawCardParamsType {
  accountId: string; // 金融账户ID
  cardType: 0 | 1 | 2 | 4; // 0：对公，1：对私法人，2：对私非法人，4：对公非同名；个人商户/用户不支持对公类型，对私非法人类型;
  // bankName: string; // 开户行名称
  // cardName: string; // 持卡人姓名
  cardNo: string; // 卡号
  provId: string; // 银行所在省ID
  areaId: string; // 银行所在城市ID
  branchCode?: string; // 银行支行联行号; 当card_type=0时必填
}

export function bindWithdrawCard({accountId, ...params}: BindWithdrawCardParamsType, config?: AxiosRequestConfig) {
  return FUtil.Request({
    method: 'POST',
    url: `/v3/transactions/accounts/${accountId}/bindCashCard`,
    data: params,
    ...config,
  });
}

// 金融登账户信息查询
interface QueryFinancialAccountInfoParamsType {
  accountType: 1 | 2; // 账户类型(1:个人账户 2:节点账户)
  ownerId: number; // 账户所有者ID; 根据账户类型动态赋值userId或nodeId
}

export function queryFinancialAccountInfo(params: QueryFinancialAccountInfoParamsType, config?: AxiosRequestConfig) {
  return FUtil.Request({
    method: 'GET',
    url: `/v3/transactions/accounts/query`,
    params: params,
    ...config,
  });
}

interface QueryFinancialAccountInfo2ParamsType {
  accountId: string; // 账户ID
}

export function queryFinancialAccountInfo2({accountId}: QueryFinancialAccountInfo2ParamsType, config?: AxiosRequestConfig) {
  return FUtil.Request({
    method: 'GET',
    url: `/v3/transactions/accounts/${accountId}`,
    // params: { accountId },
    ...config,
  });
}

// 查询绑定提现卡
interface QueryBindWithdrawCardParamsType {
  accountId: string; // 金融账户ID
}

export function queryBindWithdrawCard({accountId}: QueryBindWithdrawCardParamsType, config?: AxiosRequestConfig) {
  return FUtil.Request({
    method: 'GET',
    url: `/v3/transactions/accounts/${accountId}/cashCard`,
    ...config,
  });
}

// 查询提现状态
interface QueryWithdrawStatusParamsType {
  ownerId: number; // 账户所有者ID; 根据账户类型动态赋值userId或nodeId
  accountType: 1 | 2; // 账户类型(1:个人账户 2:节点账户)
}

export function queryWithdrawStatus(params: QueryWithdrawStatusParamsType, config?: AxiosRequestConfig) {
  return FUtil.Request({
    method: 'GET',
    url: `/v3/transactions/withdrawCash/check`,
    params: params,
    ...config,
  });
}

// 用户主动提现
interface WithdrawCashParamsType {
  accountId: string; // 金融账户ID
  transactionAmount: number; // 提现金额; 最多保留两位小数
}

export function withdrawCash(params: WithdrawCashParamsType, config?: AxiosRequestConfig) {
  return FUtil.Request({
    method: 'POST',
    url: `/v3/transactions/withdrawCash`,
    data: params,
    ...config,
  });
}

// 提现记录分页列表查询
interface QueryWithdrawCashListParamsType {
  accountId: string; // 金融账户ID
  skip?: number;
  limit?: number;
}

export function queryWithdrawCashList(params: QueryWithdrawCashListParamsType, config?: AxiosRequestConfig) {
  return FUtil.Request({
    method: 'GET',
    url: `/v3/transactions/withdrawCash/records`,
    params: params,
    ...config,
  });
}

// 交易记录分页列表查询
interface QueryTransactionListParamsType {
  skip?: number;
  limit?: number;
  ownerId: number; // 交易记录所属者ID; 根据所属者类型动态赋值userId或nodeId
  ownerType: 1 | 2 | 3; // 交易记录所属者类型; 1:资源创作者用户id 2:节点 3:用户id
  transactionStatus?: 1 | 2; // 1:交易成功 2:交易成功但是存在退款
  businessType?: 'ContractRoutinePayment';
  minTransactionAmount?: number;
  maxTransactionAmount?: number;
  startTransactionDate?: string;
  endTransactionDate?: string;
  keywords?: string;
}

export function queryTransactionList(params: QueryTransactionListParamsType, config?: AxiosRequestConfig) {
  return FUtil.Request({
    method: 'GET',
    url: `/v3/transactions/records`,
    params: params,
    ...config,
  });
}

// 查询统计信息
interface QueryStatisticsParamsType {
  ownerId?: number; // 交易记录所属者ID; 根据所属者类型动态赋值userId或nodeId
  ownerType: 1 | 2; // 交易记录所属者类型; 1:资源创作者用户id 2:节点
  startTransactionDate?: string;
  endTransactionDate?: string;
}

export function queryStatistics(params: QueryStatisticsParamsType, config?: AxiosRequestConfig) {
  return FUtil.Request({
    method: 'GET',
    url: `/v3/transactions/statistics`,
    params: params,
    ...config,
  });
}

// 查询手续费
interface QueryFeeParamsType {
  accountId: string; // 金融账户ID
  transactionAmount: number; // 提现金额; 最多保留两位小数
}

export function queryFee(params: QueryFeeParamsType, config?: AxiosRequestConfig) {
  return FUtil.Request({
    method: 'GET',
    url: `/v3/transactions/withdrawCashFeeCalculate`,
    params: params,
    ...config,
  });
}
