/**
 * 支付 API 测试
 */

import nock from 'nock';
import {
  getIndividualAccount,
  executePaymentEvent,
  getPaymentErrorMessage,
} from '../../../src/api/payment';
import accountInfo from '../../fixtures/responses/account-info.json';

const API_BASE_URL = 'https://api.freelog.com';

describe('Payment API', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('getIndividualAccount', () => {
    it('should get individual account successfully', async () => {
      const userId = 50021;
      
      nock(API_BASE_URL)
        .get(`/v2/accounts/individualAccounts/${userId}`)
        .reply(200, {
          ret: 0,
          errCode: 0,
          msg: 'success',
          data: accountInfo,
        });

      const result = await getIndividualAccount(userId);
      
      expect(result).toEqual(accountInfo);
      expect(result.accountId).toBe('233332382945822');
      expect(result.accountName).toBe('testuser');
      expect(result.balance).toBe('1200.00');
      expect(result.status).toBe(1);
    });

    it('should handle 404 error', async () => {
      const userId = 99999;
      
      nock(API_BASE_URL)
        .get(`/v2/accounts/individualAccounts/${userId}`)
        .reply(404, {
          ret: 404,
          errCode: 404,
          msg: '账户不存在',
          data: null,
        });

      await expect(getIndividualAccount(userId)).rejects.toThrow();
    });
  });

  describe('executePaymentEvent', () => {
    it('should execute payment successfully', async () => {
      const contractId = 'contract123';
      const body = {
        eventId: 'event123',
        accountId: '233332382945822',
        transactionAmount: 100,
        password: '123456',
      };

      const responseData = {
        transactionRecordId: 'txn123',
        status: 2, // 交易成功
      };

      nock(API_BASE_URL)
        .post(`/v2/contracts/${contractId}/events/payment`, body)
        .reply(200, {
          ret: 0,
          errCode: 0,
          msg: 'success',
          data: responseData,
        });

      const result = await executePaymentEvent(contractId, body);
      
      expect(result).toEqual(responseData);
      expect(result.transactionRecordId).toBe('txn123');
      expect(result.status).toBe(2);
    });

    it('should handle payment failure', async () => {
      const contractId = 'contract123';
      const body = {
        eventId: 'event123',
        accountId: '233332382945822',
        transactionAmount: 100,
        password: '123456',
      };

      const responseData = {
        transactionRecordId: 'txn124',
        status: 4, // 交易失败
        code: 'INSUFFICIENT_BALANCE',
      };

      nock(API_BASE_URL)
        .post(`/v2/contracts/${contractId}/events/payment`, body)
        .reply(200, {
          ret: 0,
          errCode: 0,
          msg: 'success',
          data: responseData,
        });

      const result = await executePaymentEvent(contractId, body);
      
      expect(result).toEqual(responseData);
      expect(result.status).toBe(4);
      expect(result.code).toBe('INSUFFICIENT_BALANCE');
    });

    it('should handle invalid password error', async () => {
      const contractId = 'contract123';
      const body = {
        eventId: 'event123',
        accountId: '233332382945822',
        transactionAmount: 100,
        password: 'wrong',
      };

      nock(API_BASE_URL)
        .post(`/v2/contracts/${contractId}/events/payment`, body)
        .reply(400, {
          ret: 400,
          errCode: 400,
          msg: '支付密码错误',
          data: null,
        });

      await expect(executePaymentEvent(contractId, body)).rejects.toThrow();
    });
  });

  describe('getPaymentErrorMessage', () => {
    it('should return correct error message for known codes', () => {
      expect(getPaymentErrorMessage('INSUFFICIENT_BALANCE')).toBe('账户余额不足');
      expect(getPaymentErrorMessage('INVALID_PASSWORD')).toBe('支付密码错误');
      expect(getPaymentErrorMessage('ACCOUNT_FROZEN')).toBe('账户已被冻结');
      expect(getPaymentErrorMessage('ACCOUNT_NOT_ACTIVATED')).toBe('账户未激活');
      expect(getPaymentErrorMessage('TRANSACTION_FAILED')).toBe('交易失败');
    });

    it('should return default message for unknown codes', () => {
      expect(getPaymentErrorMessage('UNKNOWN_ERROR')).toBe('支付失败');
      expect(getPaymentErrorMessage('')).toBe('支付失败');
      expect(getPaymentErrorMessage(undefined)).toBe('支付失败');
    });
  });
});

