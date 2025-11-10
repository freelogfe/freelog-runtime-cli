/**
 * 用户相关 API
 * 文档: https://doc.freelog.com/userV2/
 */

import { freelogRequest } from '../core/http';

/**
 * 登录请求参数
 */
export interface LoginBody {
  /** 登录名: 用户名或手机号或者邮箱 */
  loginName: string;
  /** 用户密码, 6-24位长度 */
  password: string;
  /** 是否记住密码 0:不记住 1:记住 */
  isRemember?: 0 | 1;
  /** 登录成功后跳转地址 */
  returnUrl?: string;
  /** 登录信息存放方式(cookie或者header) */
  jwtType?: 'cookie' | 'header';
}

/**
 * 登录响应数据
 */
export interface LoginResponse {
  /** 用户ID */
  userId: number;
  /** 用户姓名 */
  userName: string;
  /** 用户昵称 */
  nickname: string;
  /** email地址 */
  email: string;
  /** 手机号码 */
  mobile: string;
  /** Token序列号 */
  tokenSn: string;
  /** 用户现有角色 */
  userRole: number;
  /** 用户状态 0:正常 1:冻结 2:测试资格审核中 3:申请测试资格未通过 */
  status: number;
  /** 创建日期 */
  createDate: string;
  /** 数据最后更新日期 */
  updateDate: string;
  /** 用户头像URL */
  headImage: string;
  /** 用户类型 0:初始账户 1:内测账户 */
  userType?: number;
}

/**
 * 用户登录
 * @see https://doc.freelog.com/userV2/%E7%94%A8%E6%88%B7%E7%99%BB%E5%BD%95.html
 */
export async function login(body: LoginBody): Promise<LoginResponse> {
  const response = await freelogRequest.post<LoginResponse>('/v2/passport/login', body);
  return response;
}

/**
 * 用户登出
 * @param returnUrl 退出登录成功后跳转地址, 默认为"/"
 * @see https://doc.freelog.com/userV2/%E7%94%A8%E6%88%B7%E7%99%BB%E5%87%BA.html
 */
export async function logout(returnUrl?: string): Promise<void> {
  const params = returnUrl ? { returnUrl } : {};
  await freelogRequest.get<void>('/v2/passport/logout', { params });
}

/**
 * 获取当前登录用户信息
 * @see https://doc.freelog.com/userV2/%E8%8E%B7%E5%8F%96%E5%BD%93%E5%89%8D%E7%99%BB%E5%BD%95%E7%94%A8%E6%88%B7%E4%BF%A1%E6%81%AF.html
 */
export async function getCurrentUser(): Promise<LoginResponse> {
  const response = await freelogRequest.get<LoginResponse>('/v2/passport/current');
  return response;
}

