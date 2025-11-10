# 测试环境搭建指南

## 🚀 快速开始

### 1. 安装测试依赖

项目已经配置了所有必要的测试依赖，只需运行：

```bash
pnpm install
```

这将安装以下测试相关的依赖：

#### 核心依赖
- `jest@^29.7.0` - 测试框架
- `ts-jest@^29.1.1` - TypeScript 支持
- `@types/jest@^29.5.11` - Jest 类型定义

#### Mock 工具
- `nock@^13.5.0` - HTTP 请求 Mock
- `memfs@^4.6.0` - 文件系统 Mock

### 2. 验证安装

运行以下命令验证测试环境是否正确配置：

```bash
pnpm test
```

如果看到测试输出并显示通过的测试用例，说明环境配置成功！

## 📁 项目结构

安装后的测试相关文件：

```
freelog-cli-ts/
├── jest.config.js          # Jest 配置文件
├── package.json            # 包含测试脚本
├── tests/                  # 测试目录
│   ├── unit/              # 单元测试
│   │   ├── api/
│   │   ├── core/
│   │   └── services/
│   ├── integration/       # 集成测试
│   ├── fixtures/          # 测试数据
│   │   ├── configs/
│   │   └── responses/
│   └── helpers/           # 测试辅助工具
│       ├── setup.ts
│       ├── mockApi.ts
│       └── mockFs.ts
└── TEST_PLAN.md           # 测试规划
```

## 🧪 运行测试

### 基本命令

```bash
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

### 高级用法

```bash
# 运行特定文件的测试
pnpm test errors.test.ts

# 运行匹配模式的测试
pnpm test --testPathPattern=api

# 只运行失败的测试
pnpm test --onlyFailures

# 详细输出
pnpm test --verbose

# 并发控制
pnpm test --maxWorkers=4
```

## 📊 查看覆盖率

生成覆盖率报告后：

```bash
pnpm test:coverage
```

报告位置：
- 终端输出：直接在命令行中查看
- HTML 报告：`coverage/lcov-report/index.html`（用浏览器打开）
- LCOV 文件：`coverage/lcov.info`（用于 CI 工具）

## 🐛 常见问题

### Q1: 找不到 jest 命令

**解决方案**：
```bash
# 重新安装依赖
rm -rf node_modules
pnpm install
```

### Q2: TypeScript 类型错误

**解决方案**：
```bash
# 确保安装了类型定义
pnpm install @types/jest @types/node --save-dev
```

### Q3: Mock 不生效

**解决方案**：
- 确保 Mock 在导入模块之前定义
- 使用 `jest.resetModules()` 清除缓存
- 检查 Mock 路径是否正确

### Q4: 测试超时

**解决方案**：
```bash
# 增加超时时间
pnpm test --testTimeout=10000

# 或在测试文件中设置
jest.setTimeout(10000);
```

### Q5: 文件系统 Mock 问题

**解决方案**：
```typescript
// 确保在每个测试后清理
afterEach(() => {
  vol.reset();
});
```

## 📝 编写第一个测试

### 1. 创建测试文件

在 `tests/unit/` 目录下创建测试文件：

```typescript
// tests/unit/example.test.ts
describe('Example Test', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
});
```

### 2. 运行测试

```bash
pnpm test example.test.ts
```

### 3. 查看结果

应该看到：
```
 PASS  tests/unit/example.test.ts
  Example Test
    ✓ should pass (2 ms)
```

## 🎯 下一步

1. ✅ 阅读 `tests/README.md` 了解测试结构
2. ✅ 查看 `TEST_PLAN.md` 了解测试规划
3. ✅ 参考现有测试文件编写新测试
4. ✅ 运行 `pnpm test:coverage` 查看覆盖率
5. ✅ 提交代码前运行 `pnpm test` 确保所有测试通过

## 💡 提示

- **开发时使用监听模式**: `pnpm test:watch`
- **提交前检查覆盖率**: `pnpm test:coverage`
- **CI 使用**: `pnpm test:ci`
- **调试测试**: 在代码中添加 `debugger`，然后运行 `node --inspect-brk node_modules/.bin/jest --runInBand`

## 🔗 相关文档

- [Jest 官方文档](https://jestjs.io/)
- [ts-jest 文档](https://kulshekhar.github.io/ts-jest/)
- [nock 文档](https://github.com/nock/nock)
- [本项目测试文档](./tests/README.md)
- [测试规划](./TEST_PLAN.md)

---

**祝测试愉快！** 🎉

