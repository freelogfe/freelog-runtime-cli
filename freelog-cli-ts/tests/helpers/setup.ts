/**
 * Jest 测试环境设置
 */

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.FREELOG_ENV = 'development';

// 禁用 console 输出（可选）
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // error: jest.fn(), // 保留 error 输出用于调试
};

// 设置默认超时时间
jest.setTimeout(10000);

