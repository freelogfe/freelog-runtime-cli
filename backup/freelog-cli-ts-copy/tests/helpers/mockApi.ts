/**
 * API Mock 辅助工具
 */

import nock from 'nock';

const API_BASE_URL = process.env.FREELOG_API_BASE_URL || 'https://api.freelog.com';

/**
 * Mock API 响应
 */
export class ApiMocker {
  private scope: nock.Scope;

  constructor() {
    this.scope = nock(API_BASE_URL);
  }

  /**
   * Mock 成功响应
   */
  mockSuccess(path: string, method: 'get' | 'post' | 'put' | 'delete', data: any) {
    const interceptor = this.scope[method](path);
    return interceptor.reply(200, {
      ret: 0,
      errCode: 0,
      msg: 'success',
      data,
    });
  }

  /**
   * Mock 错误响应
   */
  mockError(path: string, method: 'get' | 'post' | 'put' | 'delete', statusCode: number, errorMsg: string) {
    const interceptor = this.scope[method](path);
    return interceptor.reply(statusCode, {
      ret: statusCode,
      errCode: statusCode,
      msg: errorMsg,
      data: null,
    });
  }

  /**
   * Mock 资源详情
   */
  mockResourceDetail(resourceId: string, data: any) {
    return this.mockSuccess(`/v2/resources/${resourceId}`, 'get', data);
  }

  /**
   * Mock 资源版本信息
   */
  mockResourceVersion(resourceId: string, version: string, data: any) {
    return this.mockSuccess(`/v2/resources/${resourceId}/versions/${version}`, 'get', data);
  }

  /**
   * Mock 创建资源版本
   */
  mockCreateVersion(resourceId: string, data: any) {
    return this.mockSuccess(`/v2/resources/${resourceId}/versions`, 'post', data);
  }

  /**
   * Mock 个人账户信息
   */
  mockIndividualAccount(userId: number, data: any) {
    return this.mockSuccess(`/v2/accounts/individualAccounts/${userId}`, 'get', data);
  }

  /**
   * Mock 支付事件
   */
  mockPaymentEvent(contractId: string, data: any) {
    return this.mockSuccess(`/v2/contracts/${contractId}/events/payment`, 'post', data);
  }

  /**
   * Mock 依赖树
   */
  mockDependencyTree(resourceId: string, data: any) {
    return this.mockSuccess(`/v2/resources/${resourceId}/dependencyTree`, 'get', data);
  }

  /**
   * 清理所有 Mock
   */
  cleanup() {
    nock.cleanAll();
  }

  /**
   * 恢复 HTTP 请求
   */
  restore() {
    nock.restore();
  }
}

/**
 * 创建 API Mocker
 */
export function createApiMocker(): ApiMocker {
  return new ApiMocker();
}

/**
 * 清理所有 Mock
 */
export function cleanupMocks() {
  nock.cleanAll();
}

/**
 * 恢复 HTTP 请求
 */
export function restoreMocks() {
  nock.restore();
}

