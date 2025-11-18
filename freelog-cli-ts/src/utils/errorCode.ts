/**
 * Freelog API 错误码说明
 * 参考：https://doc.freelog.com/%E9%99%84%E8%A1%A8/%E4%BA%8C%E7%BA%A7%E7%8A%B6%E6%80%81%E7%A0%81.html
 */

/**
 * 错误码类型定义
 */
export enum ErrCode {
  /** 正常结果 */
  SUCCESS = 0,
  /** 应用程序内部错误,一般系统自动捕捉,属于非正常流程 */
  INTERNAL_ERROR = 1,
  /** 应用程序错误,一般是业务内部主动抛出的未指定错误类型的错误 */
  APPLICATION_ERROR = 2,
  /** 授权错误,一般指获得操作授权 */
  AUTHORIZATION_ERROR = 3,
  /** 参数错误,一般指参数校验失败 */
  PARAMETER_ERROR = 4,
  /** 内部API调用错误 */
  INTERNAL_API_ERROR = 5,
  /** 业务规则中的逻辑错误 */
  BUSINESS_LOGIC_ERROR = 6,
  /** 网络相关错误 */
  NETWORK_ERROR = 7,
  /** 认证错误,一般指身份认证失败,需要登录 */
  AUTHENTICATION_ERROR = 30,
  /** 网关代理组件调用出现异常 */
  GATEWAY_PROXY_ERROR = 31,
  /** 网关服务入口处URL路由不匹配错误 */
  GATEWAY_ROUTE_ERROR = 32,
  /** 网关服务器调用上游源服务器出现错误 */
  GATEWAY_UPSTREAM_ERROR = 33,
}

/**
 * 错误码说明映射
 */
export const ERR_CODE_MESSAGES: Record<number, string> = {
  0: '正常结果',
  1: '应用程序内部错误',
  2: '应用程序错误',
  3: '授权错误',
  4: '参数错误',
  5: '内部API调用错误',
  6: '业务规则中的逻辑错误',
  7: '网络相关错误',
  30: '认证错误，需要登录',
  31: '网关代理组件调用出现异常',
  32: '网关服务入口处URL路由不匹配错误',
  33: '网关服务器调用上游源服务器出现错误',
};

/**
 * 获取错误码说明
 */
export function getErrCodeMessage(errCode: number): string {
  return ERR_CODE_MESSAGES[errCode] || `未知错误码: ${errCode}`;
}

/**
 * 根据错误码判断是否需要登录
 */
export function isAuthenticationError(errCode: number): boolean {
  return errCode === ErrCode.AUTHENTICATION_ERROR;
}

/**
 * 根据错误码判断是否是参数错误
 */
export function isParameterError(errCode: number): boolean {
  return errCode === ErrCode.PARAMETER_ERROR;
}

/**
 * 根据错误码判断是否是授权错误
 */
export function isAuthorizationError(errCode: number): boolean {
  return errCode === ErrCode.AUTHORIZATION_ERROR;
}

