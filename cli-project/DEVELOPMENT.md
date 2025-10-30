# Freelog CLI 开发文档

## 项目结构

```
cli-project/
├── bin/                    # 可执行文件入口
│   └── index.js
├── src/
│   ├── commands/          # 命令实现
│   │   ├── auth/         # 认证相关命令
│   │   │   ├── login.js
│   │   │   ├── logout.js
│   │   │   ├── status.js
│   │   │   └── index.js
│   │   ├── publish/      # 发布相关命令
│   │   │   └── index.js
│   │   ├── dependency/   # 依赖管理命令
│   │   │   ├── add.js
│   │   │   ├── remove.js
│   │   │   ├── list.js
│   │   │   └── index.js
│   │   ├── sync/         # 信息同步命令
│   │   │   └── index.js
│   │   ├── analyze/      # 文件分析命令
│   │   │   └── index.js
│   │   └── init/         # 项目初始化命令
│   │       └── index.js
│   ├── core/             # 核心功能模块
│   │   ├── auth.js       # 认证管理（登录检查、Token管理等）
│   │   ├── config.js     # 配置文件管理
│   │   ├── api.js        # API 请求封装
│   │   └── logger.js     # 日志系统
│   ├── utils/            # 工具函数
│   │   ├── file.js       # 文件操作工具
│   │   ├── validator.js  # 验证器
│   │   ├── spinner.js    # 加载动画
│   │   └── output.js     # 输出格式化
│   ├── constants/        # 常量定义
│   │   ├── errors.js     # 错误代码定义
│   │   └── config.js     # 默认配置
│   └── index.js          # 主入口文件
├── package.json
├── README.md
└── DEVELOPMENT.md        # 本文件
```

## 核心设计

### 1. 模块化架构

项目采用模块化架构，按功能分类组织代码：

- **commands/**: 命令实现层，每个命令一个目录
- **core/**: 核心功能层，提供可复用的核心功能
- **utils/**: 工具函数层，提供通用工具函数
- **constants/**: 常量定义层，集中管理配置和常量

### 2. 公共方法抽取

#### 认证检查 (`core/auth.js`)

所有需要认证的命令都使用统一的认证检查：

\`\`\`javascript
const { requireAuth, getCurrentAuth } = require('../../core/auth');

// 要求必须登录
const auth = requireAuth();

// 获取当前认证信息（可选）
const auth = getCurrentAuth();
\`\`\`

#### 配置管理 (`core/config.js`)

统一的配置文件读写接口：

\`\`\`javascript
const { readConfig, writeConfig, updateConfig } = require('../../core/config');

// 读取配置
const config = readConfig();

// 更新配置（合并）
updateConfig({ version: '1.1.0' });

// 写入配置（覆盖）
writeConfig(newConfig);
\`\`\`

#### API 请求 (`core/api.js`)

所有 API 请求都通过统一的 API 客户端：

\`\`\`javascript
const { getResource, publishResource } = require('../../core/api');

// API 请求自动携带认证 Token
const resource = await getResource(resourceId);
\`\`\`

#### 错误处理 (`constants/errors.js`)

统一的错误处理机制：

\`\`\`javascript
const { FreelogError } = require('../../constants/errors');

// 抛出标准错误
throw new FreelogError('AUTH_001');

// 带详情的错误
throw new FreelogError('FILE_001', filePath);
\`\`\`

### 3. 命令开发规范

#### 命令结构

每个命令应遵循以下结构：

\`\`\`javascript
async function executeCommand(args, options) {
  try {
    // 1. 日志记录
    logOperation('command_name', { args, options });
    
    // 2. 参数验证和认证检查
    const auth = requireAuth();
    
    // 3. 业务逻辑
    const spinner = startSpinner('处理中...');
    // ... 实现逻辑
    succeedSpinner('完成!');
    
    // 4. 结果输出
    success('操作成功');
    
    // 5. 记录成功日志
    logOperation('command_success', { result });
    
  } catch (err) {
    // 6. 错误处理
    error(err.message);
    logError(err);
    process.exit(1);
  }
}
\`\`\`

#### 交互式命令

使用 `inquirer` 进行用户交互：

\`\`\`javascript
const inquirer = require('inquirer');

const answers = await inquirer.prompt([
  {
    type: 'confirm',
    name: 'confirmed',
    message: '确定要执行此操作吗?',
    default: true
  }
]);
\`\`\`

#### 加载动画

使用统一的 spinner 工具：

\`\`\`javascript
const { startSpinner, succeedSpinner, failSpinner } = require('../../utils/spinner');

const spinner = startSpinner('正在处理...');

try {
  // 处理逻辑
  succeedSpinner('处理完成!');
} catch (err) {
  failSpinner('处理失败');
}
\`\`\`

## 开发流程

### 1. 本地开发

\`\`\`bash
# 安装依赖
npm install

# 链接到全局（用于本地测试）
npm link

# 测试命令
freelog-cli --help
\`\`\`

### 2. 添加新命令

1. 在 `src/commands/` 下创建命令目录
2. 实现命令逻辑
3. 在 `src/index.js` 中注册命令
4. 添加测试用例
5. 更新文档

### 3. 代码规范

- 使用 ESLint 检查代码
- 遵循项目的代码风格
- 添加适当的注释
- 编写单元测试

\`\`\`bash
# 运行 lint
npm run lint

# 运行测试
npm test
\`\`\`

## 测试

### 单元测试

\`\`\`bash
# 运行所有测试
npm test

# 运行测试并生成覆盖率报告
npm test -- --coverage
\`\`\`

### 集成测试

\`\`\`bash
# 测试实际命令
freelog-cli init test-project
freelog-cli login -u testuser -p testpass
\`\`\`

## 发布

\`\`\`bash
# 更新版本号
npm version patch  # 或 minor, major

# 发布到 npm
npm publish
\`\`\`

## 常见问题

### 1. 如何添加新的 API 接口？

在 `src/core/api.js` 中添加新的 API 方法：

\`\`\`javascript
async function newApiMethod(params) {
  return await apiClient.get('/new-endpoint', { params });
}

module.exports = {
  // ... 其他方法
  newApiMethod
};
\`\`\`

### 2. 如何添加新的错误代码？

在 `src/constants/errors.js` 中添加新的错误定义：

\`\`\`javascript
const ERROR_CODES = {
  // ...
  NEW_ERROR: {
    code: 'NEW_ERROR',
    message: '错误描述',
    solution: '解决方案'
  }
};
\`\`\`

### 3. 如何调试？

设置环境变量 `DEBUG=true` 和 `LOG_LEVEL=debug`：

\`\`\`bash
DEBUG=true LOG_LEVEL=debug freelog-cli your-command
\`\`\`

## 贡献指南

1. Fork 本仓库
2. 创建功能分支
3. 提交代码
4. 创建 Pull Request

## 相关资源

- [Commander.js 文档](https://github.com/tj/commander.js)
- [Inquirer.js 文档](https://github.com/SBoudrias/Inquirer.js)
- [Axios 文档](https://axios-http.com/)
- [Winston 日志库](https://github.com/winstonjs/winston)

