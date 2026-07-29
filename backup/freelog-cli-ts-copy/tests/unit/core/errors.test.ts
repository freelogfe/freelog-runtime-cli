/**
 * 错误类测试
 */

import {
  FreelogError,
  AuthError,
  ConfigError,
  NetworkError,
  ValidationError,
  PaymentError,
} from '../../../src/core/errors';

describe('Core Errors', () => {
  describe('FreelogError', () => {
    it('should create error with message', () => {
      const error = new FreelogError('test error');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(FreelogError);
      expect(error.message).toBe('test error');
      expect(error.name).toBe('FreelogError');
    });

    it('should create error with code', () => {
      const error = new FreelogError('test error', 'TEST_CODE');
      
      expect(error.code).toBe('TEST_CODE');
    });

    it('should create error with status code', () => {
      const error = new FreelogError('test error', 'TEST_CODE', 404);
      
      expect(error.statusCode).toBe(404);
    });

    it('should have stack trace', () => {
      const error = new FreelogError('test error');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('FreelogError');
    });
  });

  describe('AuthError', () => {
    it('should create auth error with default message', () => {
      const error = new AuthError();
      
      expect(error).toBeInstanceOf(FreelogError);
      expect(error).toBeInstanceOf(AuthError);
      expect(error.message).toBe('未登录');
      expect(error.name).toBe('AuthError');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.statusCode).toBe(401);
    });

    it('should create auth error with custom message', () => {
      const error = new AuthError('登录已过期');
      
      expect(error.message).toBe('登录已过期');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('ConfigError', () => {
    it('should create config error', () => {
      const error = new ConfigError('配置文件不存在');
      
      expect(error).toBeInstanceOf(FreelogError);
      expect(error).toBeInstanceOf(ConfigError);
      expect(error.message).toBe('配置文件不存在');
      expect(error.name).toBe('ConfigError');
      expect(error.code).toBe('CONFIG_ERROR');
    });
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError('网络请求失败');
      
      expect(error).toBeInstanceOf(FreelogError);
      expect(error).toBeInstanceOf(NetworkError);
      expect(error.message).toBe('网络请求失败');
      expect(error.name).toBe('NetworkError');
      expect(error.code).toBe('NETWORK_ERROR');
    });

    it('should create network error with status code', () => {
      const error = new NetworkError('服务器错误', 500);
      
      expect(error.statusCode).toBe(500);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('字段验证失败');
      
      expect(error).toBeInstanceOf(FreelogError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('字段验证失败');
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('PaymentError', () => {
    it('should create payment error with default code', () => {
      const error = new PaymentError('支付失败');
      
      expect(error).toBeInstanceOf(FreelogError);
      expect(error).toBeInstanceOf(PaymentError);
      expect(error.message).toBe('支付失败');
      expect(error.name).toBe('PaymentError');
      expect(error.code).toBe('PAYMENT_ERROR');
    });

    it('should create payment error with custom code', () => {
      const error = new PaymentError('余额不足', 'INSUFFICIENT_BALANCE');
      
      expect(error.code).toBe('INSUFFICIENT_BALANCE');
    });
  });

  describe('Error inheritance', () => {
    it('should catch as FreelogError', () => {
      const error = new AuthError();
      
      expect(error instanceof FreelogError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should work with try-catch', () => {
      expect(() => {
        throw new ConfigError('test');
      }).toThrow(ConfigError);
      
      expect(() => {
        throw new ConfigError('test');
      }).toThrow(FreelogError);
      
      expect(() => {
        throw new ConfigError('test');
      }).toThrow(Error);
    });
  });
});

