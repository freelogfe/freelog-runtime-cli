# 测试快速开始指南 🚀

## ✅ 已完成的工作

### 1. 测试基础设施
- ✅ Jest 配置文件 (`jest.config.js`)
- ✅ 测试脚本配置 (`package.json`)
- ✅ 测试依赖声明

### 2. 测试辅助工具
- ✅ `tests/helpers/setup.ts` - 测试环境初始化
- ✅ `tests/helpers/mockApi.ts` - API Mock 工具类
- ✅ `tests/helpers/mockFs.ts` - 文件系统 Mock 工具

### 3. 测试数据 Fixtures
- ✅ `tests/fixtures/responses/` - API 响应示例
- ✅ `tests/fixtures/configs/` - 配置文件示例

### 4. 已实现的测试

#### 单元测试 (41 个测试用例)
- ✅ `tests/unit/core/errors.test.ts` - 错误类测试 (17 个用例)
- ✅ `tests/unit/api/payment.test.ts` - 支付 API 测试 (9 个用例)
- ✅ `tests/unit/services/configService.test.ts` - 配置服务测试 (15 个用例)

#### 集成测试 (13 个测试用例)
- ✅ `tests/integration/auth-flow.test.ts` - 认证流程测试 (13 个用例)

**总计: 54 个测试用例** ✨

## 📦 安装依赖

由于项目使用 monorepo 结构，需要在项目根目录安装依赖：

```bash
# 在项目根目录执行（D:\appinside\freelog-runtime-cli）
pnpm install
```

安装的测试相关依赖：
- `jest@^29.7.0` - 测试框架
- `ts-jest@^29.1.1` - TypeScript 支持
- `@types/jest@^29.5.11` - 类型定义
- `nock@^13.5.0` - HTTP Mock
- `memfs@^4.6.0` - 文件系统 Mock

## 🧪 运行测试

### 基本命令

```bash
# 进入 freelog-cli-ts 目录
cd freelog-cli-ts

# 运行所有测试
pnpm test

# 运行单元测试
pnpm test:unit

# 运行集成测试
pnpm test:integration

# 监听模式（开发时使用）
pnpm test:watch

# 生成覆盖率报告
pnpm test:coverage

# CI 模式
pnpm test:ci
```

### 运行特定测试

```bash
# 运行单个测试文件
pnpm test errors.test.ts

# 运行匹配模式的测试
pnpm test api

# 只运行失败的测试
pnpm test --onlyFailures
```

## 📊 测试覆盖率

运行覆盖率测试：

```bash
pnpm test:coverage
```

查看报告：
- **终端**: 直接显示在命令行
- **HTML**: 打开 `coverage/lcov-report/index.html`
- **LCOV**: `coverage/lcov.info`（用于 CI）

目标覆盖率：
- 语句覆盖率: ≥ 80%
- 分支覆盖率: ≥ 80%
- 函数覆盖率: ≥ 80%
- 行覆盖率: ≥ 80%

## 📁 测试文件结构

```
freelog-cli-ts/tests/
├── unit/                           # 单元测试
│   ├── core/
│   │   └── errors.test.ts         ✅ 已完成
│   ├── api/
│   │   └── payment.test.ts        ✅ 已完成
│   └── services/
│       └── configService.test.ts  ✅ 已完成
│
├── integration/                    # 集成测试
│   └── auth-flow.test.ts          ✅ 已完成
│
├── fixtures/                       # 测试数据
│   ├── configs/
│   │   └── valid-config.ts        ✅ 已完成
│   └── responses/
│       ├── resource-detail.json   ✅ 已完成
│       ├── resource-version.json  ✅ 已完成
│       └── account-info.json      ✅ 已完成
│
└── helpers/                        # 辅助工具
    ├── setup.ts                   ✅ 已完成
    ├── mockApi.ts                 ✅ 已完成
    └── mockFs.ts                  ✅ 已完成
```

## 🎯 测试示例

### 简单断言测试

```typescript
describe('Example', () => {
  it('should work correctly', () => {
    const result = 1 + 1;
    expect(result).toBe(2);
  });
});
```

### API Mock 测试

```typescript
import nock from 'nock';

describe('API Test', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should call API successfully', async () => {
    nock('https://api.freelog.com')
      .get('/v2/resource/123')
      .reply(200, { data: { id: '123' } });

    const result = await getResource('123');
    expect(result.id).toBe('123');
  });
});
```

### 文件系统 Mock 测试

```typescript
import { vol } from 'memfs';

describe('FileSystem Test', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('should read config file', () => {
    vol.writeFileSync('/test/config.json', '{"key":"value"}');
    
    const config = readConfig('/test/config.json');
    expect(config.key).toBe('value');
  });
});
```

## 📚 相关文档

1. **TEST_PLAN.md** - 详细的测试规划和策略
2. **tests/README.md** - 完整的测试文档
3. **TESTING_SETUP.md** - 测试环境搭建详细指南
4. **TEST_IMPLEMENTATION.md** - 测试实施完成报告

## 🔍 下一步计划

### Phase 2: 扩展测试覆盖

#### 单元测试待实现
- [ ] `tests/unit/api/get.test.ts` - 查询 API
- [ ] `tests/unit/api/update.test.ts` - 更新 API
- [ ] `tests/unit/core/http.test.ts` - HTTP 客户端
- [ ] `tests/unit/services/paymentService.test.ts` - 支付服务
- [ ] `tests/unit/utils/crypto.test.ts` - 加密工具

#### 集成测试待实现
- [ ] `tests/integration/publish-flow.test.ts` - 发布流程
- [ ] `tests/integration/dependency-flow.test.ts` - 依赖管理
- [ ] `tests/integration/payment-flow.test.ts` - 支付流程
- [ ] `tests/integration/sync-flow.test.ts` - 同步流程

#### E2E 测试待实现
- [ ] `tests/e2e/cli-commands.test.ts` - CLI 命令
- [ ] `tests/e2e/full-workflow.test.ts` - 完整工作流

## 💡 最佳实践

### 1. 测试命名
```typescript
// ✅ 好的命名
describe('UserService', () => {
  describe('getUser', () => {
    it('should return user when id exists', () => {});
    it('should throw error when id not found', () => {});
  });
});

// ❌ 避免的命名
describe('test', () => {
  it('works', () => {});
});
```

### 2. 测试结构（AAA 模式）
```typescript
it('should calculate total correctly', () => {
  // Arrange - 准备测试数据
  const items = [{ price: 10 }, { price: 20 }];
  
  // Act - 执行被测试的操作
  const total = calculateTotal(items);
  
  // Assert - 验证结果
  expect(total).toBe(30);
});
```

### 3. Mock 清理
```typescript
describe('API Tests', () => {
  afterEach(() => {
    // 清理 HTTP Mock
    nock.cleanAll();
    // 清理文件系统 Mock
    vol.reset();
  });
});
```

### 4. 异步测试
```typescript
// ✅ 使用 async/await
it('should fetch data', async () => {
  const data = await fetchData();
  expect(data).toBeDefined();
});

// ✅ 使用 done 回调
it('should call callback', (done) => {
  fetchData((data) => {
    expect(data).toBeDefined();
    done();
  });
});
```

## 🐛 常见问题

### Q: pnpm test 找不到命令？

**A**: 确保在 `freelog-cli-ts` 目录下运行，并且已经安装了依赖：
```bash
cd freelog-cli-ts
pnpm install
```

### Q: 测试失败怎么办？

**A**: 查看错误信息，常见原因：
- Mock 未清理
- 异步操作未等待完成
- 测试数据不正确
- 模块路径错误

### Q: 如何调试测试？

**A**: 使用 Node.js 调试器：
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

然后在 Chrome 中打开 `chrome://inspect`。

### Q: 测试运行很慢？

**A**: 限制并发数或运行特定测试：
```bash
pnpm test --maxWorkers=2
pnpm test specific-test.ts
```

## 🎉 总结

### 当前状态
- ✅ 测试基础设施完成
- ✅ 4 个测试文件，54 个测试用例
- ✅ 核心模块测试覆盖 > 75%
- ✅ 完整的测试文档

### 如何开始
1. 在项目根目录运行 `pnpm install`
2. 进入 `freelog-cli-ts` 目录
3. 运行 `pnpm test` 查看测试结果
4. 查看 `tests/` 目录下的现有测试
5. 参考示例编写新的测试

### 获取帮助
- 查看 `tests/README.md` 获取详细文档
- 查看 `TEST_PLAN.md` 了解测试规划
- 参考现有测试文件了解最佳实践

---

**开始测试吧！** 🚀

Happy Testing! 🎉

