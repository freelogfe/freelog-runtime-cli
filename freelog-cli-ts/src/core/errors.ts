/**
 * Freelog CLI 基础错误类
 */
export class FreelogError extends Error {
  public code?: string;
  public statusCode?: number;
  
  constructor(message: string, code?: string, statusCode?: number) {
    super(message);
    this.name = 'FreelogError';
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 认证错误
 */
export class AuthError extends FreelogError {
  constructor(message: string = '未登录') {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'AuthError';
  }
}

/**
 * 配置错误
 */
export class ConfigError extends FreelogError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

/**
 * 网络错误
 */
export class NetworkError extends FreelogError {
  constructor(message: string, statusCode?: number) {
    super(message, 'NETWORK_ERROR', statusCode);
    this.name = 'NetworkError';
  }
}

/**
 * 验证错误
 */
export class ValidationError extends FreelogError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

/**
 * 支付错误
 */
export class PaymentError extends FreelogError {
  constructor(message: string, code?: string) {
    super(message, code || 'PAYMENT_ERROR');
    this.name = 'PaymentError';
  }
}

