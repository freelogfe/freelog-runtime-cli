# Freelog CLI 测试文档

## 测试结构

```
tests/
├── unit/                    # 单元测试
│   ├── api/                # API 层测试
│   ├── core/               # 核心模块测试
│   ├── services/           # 服务层测试
│   └── utils/              # 工具函数测试
│
├── integration/             # 集成测试
│   ├── auth-flow.test.ts   # 认证流程
│   ├── publish-flow.test.ts # 发布流程
│   ├── dependency-flow.test.ts # 依赖管理流程
│   └── payment-flow.test.ts # 支付流程
│
├── fixtures/                # 测试数据
│   ├── configs/            # 配置文件样本
│   └── responses/          # API 响应样本
│
└── helpers/                 # 测试辅助函数
    ├── setup.ts            # 测试环境设置
    ├── mockApi.ts          # API Mock 工具
    └── mockFs.ts           # 文件系统 Mock 工具
```

## 运行测试

### 安装依赖

```bash
pnpm install
```

### 运行所有测试

```bash
pnpm test
```

### 运行单元测试

```bash
pnpm test:unit
```

### 运行集成测试

```bash
pnpm test:integration
```

### 监听模式（开发时使用）

```bash
pnpm test:watch
```

### 生成覆盖率报告

```bash
pnpm test:coverage
```

覆盖率报告将生成在 `coverage/` 目录下，可以在浏览器中打开 `coverage/lcov-report/index.html` 查看详细报告。

### CI 模式

```bash
pnpm test:ci
```

## 测试技术栈

- **Jest** - 测试框架
- **ts-jest** - TypeScript 支持
- **nock** - HTTP 请求 Mock
- **memfs** - 文件系统 Mock

## 编写测试

### 单元测试示例

```typescript
// tests/unit/utils/example.test.ts
import { myFunction } from '../../../src/utils/example';

describe('myFunction', () => {
  it('should return expected result', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });

  it('should handle edge cases', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

### 集成测试示例

```typescript
// tests/integration/example-flow.test.ts
import nock from 'nock';
import { myFlow } from '../../../src/flows/example';

describe('Example Flow', () => {
  beforeEach(() => {
    // 设置 API Mock
    nock('https://api.freelog.com')
      .get('/v2/resource')
      .reply(200, { data: {} });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should complete flow successfully', async () => {
    const result = await myFlow();
    expect(result).toBeDefined();
  });
});
```

## 测试最佳实践

### 1. 测试命名

- 使用描述性的测试名称
- 使用 `describe` 组织相关测试
- 使用 `it` 或 `test` 描述单个测试用例

```typescript
describe('UserService', () => {
  describe('getUser', () => {
    it('should return user when id exists', () => {});
    it('should throw error when id not found', () => {});
  });
});
```

### 2. 测试隔离

- 每个测试应该独立运行
- 使用 `beforeEach` 和 `afterEach` 清理状态
- 避免测试之间的依赖

```typescript
describe('Example', () => {
  beforeEach(() => {
    // 设置测试环境
  });

  afterEach(() => {
    // 清理资源
    nock.cleanAll();
    vol.reset();
  });
});
```

### 3. Mock 使用

- 只 Mock 外部依赖
- 不要过度 Mock
- 使用真实数据模拟

```typescript
// 好的 Mock
nock('https://api.freelog.com')
  .get('/v2/resource/123')
  .reply(200, realResponseData);

// 避免过度 Mock
jest.mock('../../../src/core/config'); // 只在必要时 Mock
```

### 4. 断言清晰

- 使用具体的断言
- 一个测试关注一个行为
- 提供清晰的错误消息

```typescript
// 好的断言
expect(result.status).toBe(200);
expect(result.data.userId).toBe(50021);
expect(result.data.username).toBe('testuser');

// 避免模糊断言
expect(result).toBeTruthy(); // 不够具体
```

### 5. 测试边界条件

- 测试正常情况
- 测试错误情况
- 测试边界值

```typescript
describe('validateVersion', () => {
  it('should accept valid version', () => {
    expect(validateVersion('1.0.0')).toBe(true);
  });

  it('should reject invalid version', () => {
    expect(validateVersion('invalid')).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(validateVersion('')).toBe(false);
    expect(validateVersion(null)).toBe(false);
  });
});
```

## 覆盖率目标

- **语句覆盖率**: ≥ 80%
- **分支覆盖率**: ≥ 80%
- **函数覆盖率**: ≥ 80%
- **行覆盖率**: ≥ 80%

## 常见问题

### Q: 测试运行很慢怎么办？

A: 使用 `jest --maxWorkers=4` 限制并发数，或使用 `--testPathPattern` 只运行特定测试。

### Q: 如何调试测试？

A: 在测试代码中添加 `debugger` 语句，然后运行：
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Q: Mock 不生效怎么办？

A: 确保 Mock 在导入模块之前定义，使用 `jest.resetModules()` 清除模块缓存。

### Q: 如何跳过某些测试？

A: 使用 `it.skip()` 或 `describe.skip()` 跳过测试，使用 `it.only()` 只运行特定测试。

## 持续集成

项目配置了 GitHub Actions 自动运行测试。每次 push 或 PR 都会触发测试，确保代码质量。

查看 `.github/workflows/test.yml` 了解 CI 配置。

## 贡献指南

1. 为新功能编写测试
2. 确保所有测试通过
3. 保持覆盖率 ≥ 80%
4. 遵循测试最佳实践

---

**Happy Testing! 🎉**

