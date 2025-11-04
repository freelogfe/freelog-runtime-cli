export class FreelogError extends Error {
  public code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'FreelogError';
    this.code = code;
  }
}

export class AuthError extends FreelogError {
  constructor(message: string = '未登录') {
    super(message, 'AUTH_ERROR');
  }
}

