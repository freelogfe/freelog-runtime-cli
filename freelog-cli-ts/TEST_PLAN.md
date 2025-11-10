# Freelog CLI 测试规划

## 测试目标

- 单元测试覆盖率：**≥ 80%**
- 集成测试覆盖：**核心流程 100%**
- 端到端测试：**关键命令全覆盖**

## 测试技术栈

### 测试框架
- **Jest** - 测试框架和断言库
- **ts-jest** - TypeScript 支持
- **@types/jest** - Jest 类型定义

### 测试工具
- **nock** - HTTP 请求 Mock
- **mock-fs** - 文件系统 Mock
- **inquirer-test** - 交互式命令行测试
- **@inquirer/testing** - Inquirer 测试工具

### 覆盖率工具
- **jest --coverage** - 代码覆盖率报告
- **codecov** - 覆盖率可视化（可选）

## 测试结构

```
tests/
├── unit/                    # 单元测试
│   ├── api/                # API 层测试
│   │   ├── get.test.ts
│   │   ├── update.test.ts
│   │   └── payment.test.ts
│   ├── core/               # 核心模块测试
│   │   ├── auth.test.ts
│   │   ├── config.test.ts
│   │   ├── http.test.ts
│   │   └── errors.test.ts
│   ├── services/           # 服务层测试
│   │   ├── configService.test.ts
│   │   └── paymentService.test.ts
│   └── utils/              # 工具函数测试
│       └── crypto.test.ts
│
├── integration/             # 集成测试
│   ├── auth-flow.test.ts   # 认证流程
│   ├── publish-flow.test.ts # 发布流程
│   ├── dependency-flow.test.ts # 依赖管理流程
│   ├── payment-flow.test.ts # 支付流程
│   └── sync-flow.test.ts   # 同步流程
│
├── e2e/                     # 端到端测试
│   ├── cli-commands.test.ts # CLI 命令测试
│   └── full-workflow.test.ts # 完整工作流测试
│
├── fixtures/                # 测试数据
│   ├── configs/            # 配置文件样本
│   ├── responses/          # API 响应样本
│   └── mocks/              # Mock 数据
│
└── helpers/                 # 测试辅助函数
    ├── setup.ts            # 测试环境设置
    ├── teardown.ts         # 测试清理
    ├── mockApi.ts          # API Mock 工具
    └── mockFs.ts           # 文件系统 Mock 工具
```

## 单元测试规划

### 1. API 层测试 (api/)

#### get.test.ts
- [ ] `getResourceDetail()` - 获取资源详情
- [ ] `getResourceVersionInfo()` - 获取资源版本信息
- [ ] `getResourceVersionList()` - 获取资源版本列表
- [ ] `getResourceDependencyTree()` - 获取依赖树
- [ ] `getResourceAuthTree()` - 获取授权树
- [ ] `getResourceVersionDraft()` - 获取版本草稿
- [ ] `getBatchResourceVersionList()` - 批量获取版本列表
- [ ] 错误处理测试
- [ ] 参数验证测试

#### update.test.ts
- [ ] `createResourceVersion()` - 创建资源版本
- [ ] `saveResourceVersionDraft()` - 保存版本草稿
- [ ] 请求体验证测试
- [ ] 错误处理测试

#### payment.test.ts
- [ ] `getIndividualAccount()` - 获取个人账户
- [ ] `executePaymentEvent()` - 执行支付事件
- [ ] 账户状态验证测试
- [ ] 支付错误码映射测试
- [ ] 错误处理测试

### 2. 核心模块测试 (core/)

#### auth.test.ts
- [ ] `saveAuth()` - 保存认证信息
  - 全局保存
  - 工作空间保存
  - 加密测试
- [ ] `getAuth()` - 获取认证信息
  - 全局获取
  - 工作空间获取
  - 解密测试
- [ ] `getCurrentAuth()` - 获取当前认证
  - 优先级测试（工作空间 > 全局）
- [ ] `requireAuth()` - 必须认证
  - 已登录情况
  - 未登录抛出错误
- [ ] `clearAuth()` - 清除认证
  - 清除全局
  - 清除工作空间

#### config.test.ts
- [ ] `findWorkspaceRoot()` - 查找工作空间根目录
- [ ] `getConfigPath()` - 获取配置文件路径
- [ ] 环境变量覆盖测试

#### http.test.ts
- [ ] HTTP 客户端初始化
- [ ] 请求拦截器
  - 认证 token 添加
  - 请求日志
- [ ] 响应拦截器
  - 数据提取
  - 错误处理
- [ ] 超时处理
- [ ] 重试机制（如果有）

#### errors.test.ts
- [ ] `FreelogError` - 基础错误
- [ ] `AuthError` - 认证错误
- [ ] `ConfigError` - 配置错误
- [ ] `NetworkError` - 网络错误
- [ ] `ValidationError` - 验证错误
- [ ] `PaymentError` - 支付错误
- [ ] 错误堆栈测试

### 3. 服务层测试 (services/)

#### configService.test.ts
- [ ] `getConfigPath()` - 获取配置路径
  - 自定义路径
  - 自动查找（TS/JS/JSON5/JSON）
  - 文件不存在错误
- [ ] `loadConfig()` - 加载配置
  - TypeScript 配置
  - JavaScript 配置
  - JSON5 配置
  - JSON 配置
  - 配置验证
  - 加载失败错误
- [ ] `validateConfig()` - 验证配置
  - 必填字段验证
  - 格式验证
  - 验证错误消息
- [ ] `saveConfig()` - 保存配置
  - 保存到 TypeScript
  - 保存到 JSON5
  - 保存到 JSON
  - 格式化输出
- [ ] `configToVersionBody()` - 配置转换
  - 完整转换
  - 字段映射
  - resourceId 排除

#### paymentService.test.ts
- [ ] `processPayment()` - 支付流程
  - 获取策略列表
  - 选择策略
  - 获取支付事件
  - 选择支付事件
  - 获取账户信息
  - 账户状态验证
  - 余额验证
  - 密码输入
  - 支付确认
  - 执行支付
  - 结果处理
- [ ] 错误场景测试
  - 账户未激活
  - 账户已冻结
  - 余额不足
  - 支付失败
  - 网络错误

### 4. 工具函数测试 (utils/)

#### crypto.test.ts
- [ ] `encrypt()` - 加密
  - 正常加密
  - 空字符串
  - 特殊字符
- [ ] `decrypt()` - 解密
  - 正常解密
  - 错误密文
  - 解密失败

## 集成测试规划

### 1. 认证流程测试 (auth-flow.test.ts)
- [ ] 完整登录流程
  - 输入用户名密码
  - 调用登录 API
  - 保存认证信息
  - 验证保存结果
- [ ] 登出流程
  - 清除认证信息
  - 验证清除结果
- [ ] 查看状态流程
  - 显示登录状态
  - 显示用户信息

### 2. 发布流程测试 (publish-flow.test.ts)
- [ ] 完整发布流程
  - 加载配置文件
  - 验证配置
  - 调用创建版本 API
  - 显示发布结果
- [ ] 草稿发布流程
  - 创建草稿
  - 验证草稿保存
- [ ] 发布失败场景
  - 配置文件不存在
  - 配置验证失败
  - API 调用失败

### 3. 依赖管理流程测试 (dependency-flow.test.ts)
- [ ] 添加依赖流程
  - 搜索资源
  - 选择版本
  - 选择策略
  - 签约
  - 支付（如需要）
  - 更新配置
- [ ] 移除依赖流程
  - 查找依赖
  - 确认移除
  - 更新配置
- [ ] 更新依赖流程
  - 查找依赖
  - 选择新版本
  - 更新配置
- [ ] 查看依赖流程
  - 显示依赖列表
  - 显示依赖树

### 4. 支付流程测试 (payment-flow.test.ts)
- [ ] 完整支付流程
  - 获取账户信息
  - 选择策略
  - 选择支付事件
  - 输入金额
  - 输入密码
  - 确认支付
  - 执行支付
  - 处理结果
- [ ] 支付失败场景
  - 账户未激活
  - 余额不足
  - 密码错误
  - 网络错误

### 5. 同步流程测试 (sync-flow.test.ts)
- [ ] 完整同步流程
  - 加载本地配置
  - 获取服务器信息
  - 显示差异
  - 确认同步
  - 更新本地配置
- [ ] 同步失败场景
  - 配置文件不存在
  - 资源不存在
  - 网络错误

## 端到端测试规划

### 1. CLI 命令测试 (cli-commands.test.ts)
- [ ] `freelog-cli login`
- [ ] `freelog-cli logout`
- [ ] `freelog-cli status`
- [ ] `freelog-cli init`
- [ ] `freelog-cli publish`
- [ ] `freelog-cli sync`
- [ ] `freelog-cli add`
- [ ] `freelog-cli remove`
- [ ] `freelog-cli list`
- [ ] `freelog-cli update`
- [ ] `freelog-cli change`
- [ ] `freelog-cli analyze`
- [ ] 命令帮助测试
- [ ] 错误命令测试

### 2. 完整工作流测试 (full-workflow.test.ts)
- [ ] 新项目完整流程
  1. 初始化项目 (`init`)
  2. 登录 (`login`)
  3. 添加依赖 (`add`)
  4. 发布作品 (`publish`)
  5. 同步信息 (`sync`)
  6. 更新依赖 (`update`)
  7. 再次发布 (`publish`)
  8. 登出 (`logout`)

## 测试数据准备

### Fixtures

#### 1. 配置文件样本 (fixtures/configs/)
```typescript
// valid-config.ts - 有效配置
// invalid-config.ts - 无效配置
// minimal-config.ts - 最小配置
// full-config.ts - 完整配置
```

#### 2. API 响应样本 (fixtures/responses/)
```typescript
// resource-detail.json - 资源详情
// resource-version.json - 资源版本
// dependency-tree.json - 依赖树
// account-info.json - 账户信息
// payment-result.json - 支付结果
```

#### 3. Mock 数据 (fixtures/mocks/)
```typescript
// auth.mock.ts - 认证 Mock
// api.mock.ts - API Mock
// fs.mock.ts - 文件系统 Mock
```

## 测试配置

### jest.config.js
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/bin/*.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
```

### package.json 脚本
```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

## 实施计划

### 第一阶段：基础设施搭建 (30分钟)
1. ✅ 安装测试依赖
2. ✅ 配置 Jest
3. ✅ 创建测试目录结构
4. ✅ 创建测试辅助工具

### 第二阶段：单元测试 (2小时)
1. ✅ API 层测试 (30分钟)
2. ✅ 核心模块测试 (30分钟)
3. ✅ 服务层测试 (40分钟)
4. ✅ 工具函数测试 (20分钟)

### 第三阶段：集成测试 (1.5小时)
1. ✅ 认证流程测试 (20分钟)
2. ✅ 发布流程测试 (20分钟)
3. ✅ 依赖管理流程测试 (30分钟)
4. ✅ 支付流程测试 (20分钟)
5. ✅ 同步流程测试 (20分钟)

### 第四阶段：端到端测试 (1小时)
1. ✅ CLI 命令测试 (30分钟)
2. ✅ 完整工作流测试 (30分钟)

### 第五阶段：优化和完善 (30分钟)
1. ✅ 提高覆盖率
2. ✅ 优化测试性能
3. ✅ 完善测试文档

## 预期成果

### 覆盖率目标
- **语句覆盖率**: ≥ 80%
- **分支覆盖率**: ≥ 80%
- **函数覆盖率**: ≥ 80%
- **行覆盖率**: ≥ 80%

### 测试数量目标
- **单元测试**: ~100 个测试用例
- **集成测试**: ~30 个测试用例
- **端到端测试**: ~15 个测试用例
- **总计**: ~145 个测试用例

### 质量目标
- ✅ 所有测试通过
- ✅ 无测试警告
- ✅ 快速执行（< 30秒）
- ✅ 稳定可靠（无间歇性失败）

## 持续集成

### GitHub Actions
```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test:ci
      - uses: codecov/codecov-action@v2
```

---

**文档版本**: 1.0.0  
**创建时间**: 2025-11-10  
**状态**: 📋 规划完成，准备实施

