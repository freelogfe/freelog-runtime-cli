# 项目架构说明

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Interface                            │
│                      (Commander.js)                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Commands Layer                              │
│  ┌──────────┬──────────┬───────────┬────────┬─────────┬──────┐ │
│  │  auth/   │ publish/ │dependency/│ sync/  │analyze/ │init/ │ │
│  └──────────┴──────────┴───────────┴────────┴─────────┴──────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Core Layer                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ auth.js   - 认证管理（登录检查、Token管理）                 │ │
│  │ config.js - 配置文件管理（读写、验证、合并）               │ │
│  │ api.js    - API请求封装（拦截器、错误处理）                │ │
│  │ logger.js - 日志系统（操作日志、错误日志）                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Utils Layer                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ file.js      - 文件操作（压缩、验证、复制）                 │ │
│  │ validator.js - 验证器（版本、资源ID、配置）                │ │
│  │ spinner.js   - 加载动画（ora 封装）                        │ │
│  │ output.js    - 输出格式化（表格、状态、进度）              │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Constants Layer                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ errors.js - 错误代码定义（FreelogError）                   │ │
│  │ config.js - 默认配置（API、Auth、Log、Upload）             │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 数据流

### 1. 命令执行流程

```
用户输入命令
    │
    ▼
Commander 解析
    │
    ▼
Command Handler
    │
    ├─→ 日志记录 (logger)
    │
    ├─→ 认证检查 (auth)
    │
    ├─→ 配置读取 (config)
    │
    ├─→ 用户交互 (inquirer)
    │
    ├─→ 业务逻辑处理
    │   │
    │   ├─→ API 请求 (api)
    │   │
    │   ├─→ 文件操作 (file utils)
    │   │
    │   └─→ 数据验证 (validator)
    │
    ├─→ 结果输出 (output)
    │
    └─→ 日志记录 (logger)
```

### 2. 认证流程

```
命令执行
    │
    ▼
requireAuth() ──────────────┐
    │                       │
    ▼                       │
getCurrentAuth()            │
    │                       │
    ├─→ 检查工作空间认证      │
    │   ├─→ 存在且有效 ─────┘
    │   └─→ 不存在或过期
    │           │
    ├─→ 检查全局认证          │
    │   ├─→ 存在且有效 ─────┘
    │   └─→ 不存在或过期
    │           │
    ▼           ▼
  返回认证    抛出错误
             (AUTH_001)
```

### 3. API 请求流程

```
命令调用 API
    │
    ▼
API Client
    │
    ├─→ 请求拦截器
    │   ├─→ 添加 Token
    │   ├─→ 设置 Headers
    │   └─→ 日志记录
    │
    ▼
发送 HTTP 请求
    │
    ▼
响应拦截器
    │
    ├─→ 成功响应
    │   ├─→ 日志记录
    │   └─→ 返回数据
    │
    └─→ 错误响应
        ├─→ 401 → AUTH_001
        ├─→ 403 → AUTH_003
        ├─→ 404 → DEP_001
        ├─→ 500 → SERVER_001
        └─→ 其他 → NETWORK_001
```

## 核心模块详解

### 1. 认证模块 (core/auth.js)

**职责**:
- 管理用户认证信息
- 检查登录状态
- 验证 Token 有效性

**关键方法**:
```javascript
getAuth(global)           // 获取认证信息
saveAuth(data, global)    // 保存认证信息
removeAuth(global)        // 删除认证信息
isAuthenticated(global)   // 检查是否已登录
getCurrentAuth()          // 获取当前有效认证
requireAuth()             // 要求必须登录（抛错）
getAllAuthStatus()        // 获取所有认证状态
```

**认证优先级**:
1. 工作空间认证（项目级别）
2. 全局认证（用户级别）

### 2. 配置模块 (core/config.js)

**职责**:
- 读写 freelog.json 配置文件
- 验证配置完整性
- 合并配置更新

**关键方法**:
```javascript
getConfigPath(dir)              // 获取配置文件路径
hasConfig(dir)                  // 检查配置是否存在
readConfig(dir, required)       // 读取配置
writeConfig(config, dir)        // 写入配置
updateConfig(updates, dir)      // 更新配置（合并）
createDefaultConfig(overrides)  // 创建默认配置
validateConfig(config)          // 验证配置
```

**配置结构**:
```javascript
{
  version: "1.0.0",
  local: { buildDir, entryFile, excludes },
  resource: { resourceId, resourceName, ... },
  properties: [...],
  customOptions: [...],
  changelog: {...},
  dependencies: [...]
}
```

### 3. API 模块 (core/api.js)

**职责**:
- 封装所有 API 请求
- 自动管理认证 Token
- 统一错误处理

**关键方法**:
```javascript
// 认证
login(username, password)

// 发布
publishResource(data)
publishDraft(data)

// 资源
getResource(resourceId)
getResourceVersion(resourceId, version)
searchResources(keyword, options)

// 依赖
getDependencies(resourceId, version)
addDependency(resourceId, dependency)
removeDependency(resourceId, dependencyId)
updateDependency(resourceId, dependencyId, updates)

// 策略
getPolicies(resourceId)
signContract(policyId, data)

// 文件
uploadFile(filePath, onProgress)
```

### 4. 日志模块 (core/logger.js)

**职责**:
- 记录操作日志
- 记录错误日志
- 管理日志文件

**关键方法**:
```javascript
logger.info(message)      // 信息日志
logger.error(message)     // 错误日志
logger.warn(message)      // 警告日志
logger.debug(message)     // 调试日志

logOperation(op, data)    // 记录操作
logError(error, context)  // 记录错误
```

**日志位置**:
- Windows: `%USERPROFILE%\.freelog-cli\logs\`
- macOS/Linux: `~/.freelog-cli/logs/`

## 工具模块详解

### 1. 文件工具 (utils/file.js)

```javascript
zipDirectory(source, output)           // 压缩目录
getFileSize(filePath)                 // 获取文件大小
validateFileSize(filePath, maxSize)   // 验证文件大小
validateFileType(filePath, types)     // 验证文件类型
formatFileSize(bytes)                 // 格式化文件大小
copyDirectory(src, dest, options)     // 复制目录
removeTarget(target)                  // 删除文件/目录
ensureDirectory(dir)                  // 确保目录存在
readJsonFile(filePath)                // 读取 JSON
writeJsonFile(filePath, data)         // 写入 JSON
```

### 2. 验证器 (utils/validator.js)

```javascript
validateVersion(version)              // 验证版本号
compareVersions(v1, v2)              // 比较版本
satisfiesVersion(version, range)      // 检查版本范围
incrementVersion(version, type)       // 递增版本
validateResourceId(resourceId)        // 验证资源ID
validateEmail(email)                  // 验证邮箱
validateUrl(url)                      // 验证URL
parseResourceIdentifier(identifier)   // 解析资源标识符
validateOption(option)                // 验证配置项
validateDependency(dependency)        // 验证依赖
```

### 3. 输出工具 (utils/output.js)

```javascript
success(message)                      // 成功消息 ✔
error(message)                        // 错误消息 ✖
warning(message)                      // 警告消息 ⚠
info(message)                         // 信息消息 ℹ
title(title)                          // 标题
divider()                             // 分隔线
createTable(options)                  // 创建表格
printDependenciesTable(deps)          // 打印依赖表格
printAuthStatus(status)               // 打印登录状态
printVersionChange(old, new)          // 打印版本变更
printProgress(current, total, label)  // 打印进度
printValidationResult(result)         // 打印验证结果
printTemplateList(templates)          // 打印模板列表
```

### 4. 加载动画 (utils/spinner.js)

```javascript
createSpinner(text)       // 创建 spinner
startSpinner(text)        // 开始动画
succeedSpinner(text)      // 成功停止 ✔
failSpinner(text)         // 失败停止 ✖
warnSpinner(text)         // 警告停止 ⚠
infoSpinner(text)         // 信息停止 ℹ
stopSpinner()             // 停止动画
```

## 错误处理机制

### 错误层次

```
FreelogError (自定义错误类)
    │
    ├─→ AUTH 系列（认证相关）
    │   ├─→ AUTH_001: 未登录或过期
    │   ├─→ AUTH_002: 登录凭证无效
    │   └─→ AUTH_003: 权限不足
    │
    ├─→ FILE 系列（文件相关）
    │   ├─→ FILE_001: 文件不存在
    │   ├─→ FILE_002: 文件格式不支持
    │   └─→ FILE_003: 文件大小超限
    │
    ├─→ VERSION 系列（版本相关）
    │   ├─→ VERSION_001: 版本号格式错误
    │   ├─→ VERSION_002: 版本号已存在
    │   └─→ VERSION_003: 版本号不能降级
    │
    ├─→ DEP 系列（依赖相关）
    │   ├─→ DEP_001: 依赖不存在
    │   ├─→ DEP_002: 依赖版本不存在
    │   ├─→ DEP_003: 依赖未授权
    │   └─→ DEP_004: 依赖版本冲突
    │
    ├─→ CONFIG 系列（配置相关）
    │   ├─→ CONFIG_001: 配置文件不存在
    │   └─→ CONFIG_002: 配置文件格式错误
    │
    ├─→ NETWORK 系列（网络相关）
    │   ├─→ NETWORK_001: 网络连接失败
    │   └─→ NETWORK_002: 服务器响应超时
    │
    └─→ SERVER 系列（服务器相关）
        └─→ SERVER_001: 服务器内部错误
```

### 错误处理流程

```
命令执行 → 捕获异常
    │
    ▼
if (err instanceof FreelogError)
    │                       │
    │                       └─→ 其他错误
    ▼                           │
显示友好错误消息                  │
    │                           ▼
    │                     显示通用错误
    │                           │
    └───────────┬───────────────┘
                │
                ▼
          记录错误日志
                │
                ▼
          process.exit(1)
```

## 扩展指南

### 添加新命令

1. **创建命令文件**
```javascript
// src/commands/newcmd/index.js
const { requireAuth } = require('../../core/auth');
const { logOperation, logError } = require('../../core/logger');

async function executeNewCmd(args, options) {
  try {
    logOperation('new_cmd', { args, options });
    const auth = requireAuth();
    
    // 业务逻辑...
    
    logOperation('new_cmd_success');
  } catch (err) {
    logError(err);
    process.exit(1);
  }
}

module.exports = executeNewCmd;
```

2. **注册命令**
```javascript
// src/index.js
const executeNewCmd = require('./commands/newcmd');

program
  .command('newcmd')
  .description('新命令描述')
  .option('-f, --flag', '选项描述')
  .action(executeNewCmd);
```

### 添加新 API

```javascript
// src/core/api.js

/**
 * 新的 API 方法
 */
async function newApiMethod(params) {
  return await apiClient.post('/new-endpoint', params);
}

module.exports = {
  // ... 其他方法
  newApiMethod
};
```

### 添加新错误

```javascript
// src/constants/errors.js

const ERROR_CODES = {
  // ...
  NEW_ERROR: {
    code: 'NEW_ERROR',
    message: '错误描述',
    solution: '解决方案'
  }
};
```

## 性能考虑

### 1. 异步操作

所有 I/O 操作都使用异步方式：
- 文件读写: `fs-extra` (异步)
- HTTP 请求: `axios` (Promise)
- 用户交互: `inquirer` (Promise)

### 2. 错误处理

- 快速失败原则
- 明确的错误消息
- 详细的日志记录

### 3. 缓存策略

- 配置文件缓存（内存）
- API 响应缓存（可选）

### 4. 资源清理

- 临时文件自动清理
- Spinner 自动停止
- 进程异常退出处理

## 安全考虑

### 1. 敏感信息

- Token 存储在本地文件
- 密码不记录日志
- 配置文件权限控制

### 2. 文件操作

- 路径验证
- 文件类型检查
- 文件大小限制

### 3. API 请求

- HTTPS 通信
- Token 自动刷新
- 请求超时控制

---

**注**: 本架构设计遵循 SOLID 原则，确保代码的可维护性和可扩展性。

