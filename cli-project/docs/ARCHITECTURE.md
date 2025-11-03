# 项目架构

## 目录结构（精简后）

```
cli-project/
├── bin/index.js              # CLI 入口
├── src/
│   ├── index.js              # 命令注册
│   ├── commands/             # 命令实现
│   │   ├── auth.js          # 认证命令（login/logout/status）
│   │   ├── init.js          # 初始化
│   │   ├── publish.js       # 发布
│   │   ├── sync.js          # 同步
│   │   ├── analyze.js       # 分析
│   │   └── dependency/      # 依赖命令（保留目录，文件较大）
│   │       ├── add.js
│   │       ├── change.js
│   │       ├── update.js
│   │       ├── remove.js
│   │       ├── list.js
│   │       └── index.js
│   ├── core/                 # 核心模块（合并了 constants）
│   │   ├── api.js           # API 封装
│   │   ├── auth.js          # 认证管理
│   │   ├── config.js        # 配置管理
│   │   ├── logger.js        # 日志
│   │   ├── constants.js     # 常量配置
│   │   └── errors.js        # 错误定义
│   └── utils/                # 工具函数
│       ├── crypto.js        # Token 加密
│       ├── spinner.js       # 加载动画
│       ├── output.js        # 格式化输出
│       ├── validator.js     # 输入验证
│       ├── file.js          # 文件操作
│       └── version-selector.js  # 版本选择器
└── docs/                     # 文档（3个核心文档）
```

**精简成果**:
- ✅ 命令文件扁平化（auth/init/publish/sync/analyze）
- ✅ 合并 constants 到 core
- ✅ 删除空的子目录
- ✅ 依赖命令保留目录（文件较大）

---

## 核心模块

### API 模块 (`core/api.js`)

**功能**:
- Axios 封装和统一错误处理
- Token 自动注入请求头
- 环境自动切换（dev/prod）
- 响应数据提取

**主要函数**:
```javascript
// 资源相关
getResource(resourceIdOrName)
getResourceVersion(resourceId, version)
getResourceVersionList(resourceId)

// 策略相关
getResourcePolicies(resourceId, version)
signContract(policyId, licenseeId)
processPaymentEvent(contractId, eventId, password)

// 发布相关
uploadFileToOSS(file)
createDraft(params)
publishFormal(params)
```

**API 端点**:
- Dev: `http://api.testfreelog.com`
- Prod: `https://api.freelog.com`

---

### 认证模块 (`core/auth.js`)

**功能**:
- Token 加密存储（AES-256-CBC）
- 全局/工作空间认证
- Token 自动解密
- 过期检查

**存储位置**:
- 全局: `~/.freelog/auth.json`
- 工作空间: `./.freelog/auth.json`

---

### 配置模块 (`core/config.js`)

**功能**:
- `freelog.json` 读写
- 配置验证和默认值
- 环境变量管理

---

### 常量模块 (`core/constants.js`)

合并了原 `constants/config.js`，包含:
- 环境配置（dev/prod）
- API 端点
- 文件上传配置
- 认证配置

---

### 错误模块 (`core/errors.js`)

合并了原 `constants/errors.js`，包含:
- 错误代码常量
- `FreelogError` 类
- 统一错误格式

---

## 技术栈

| 依赖 | 版本 | 用途 |
|------|------|------|
| Node.js | >=16 | 运行环境 |
| Commander | ^11.0 | 命令行解析 |
| Inquirer | ^9.0 | 交互输入 |
| Axios | ^1.4 | HTTP 请求 |
| Chalk | ^5.3 | 终端颜色 |
| Ora | ^7.0 | 加载动画 |
| AdmZip | ^0.5 | 文件压缩 |

---

## API 集成

### Freelog API 规范

**响应格式**:
```json
{
  "ret": 0,              // 0=成功, 非0=失败
  "msg": "success",      // 消息
  "data": { ... }        // 数据
}
```

**认证方式**:
```javascript
headers: {
  'Authorization': 'Bearer <token>'
}
```

### 主要接口

```
GET  /v2/resources/{id}                    # 获取资源
GET  /v2/resources/{id}/versions/{ver}     # 获取版本
GET  /v2/resources/{id}/versions           # 版本列表
GET  /v2/auths/{id}/policies               # 获取策略
POST /v2/contracts/sign                    # 签约
POST /v2/contracts/{id}/events/{eid}       # 支付
POST /v2/resources/upload                  # 上传文件
POST /v2/resources/drafts                  # 创建草稿
POST /v2/resources/{id}/versions           # 正式发布
```

---

## 扩展开发

### 添加新命令

1. **创建命令文件**
```bash
# 简单命令 - 直接在 commands 根目录创建
touch src/commands/mycmd.js

# 复杂命令 - 创建子目录
mkdir src/commands/mycmd
touch src/commands/mycmd/index.js
```

2. **实现命令逻辑**
```javascript
// src/commands/mycmd.js
const { startSpinner, succeedSpinner } = require('../utils/spinner');

async function executeMyCmd(options) {
  const sp = startSpinner('处理中...');
  try {
    // 命令逻辑
    succeedSpinner(sp, '成功');
  } catch (error) {
    failSpinner(sp, '失败');
    throw error;
  }
}

module.exports = executeMyCmd;
```

3. **注册命令**
```javascript
// src/index.js
const executeMyCmd = require('./commands/mycmd');

program
  .command('mycmd')
  .description('我的命令')
  .action(executeMyCmd);
```

---

### 添加新 API

```javascript
// src/core/api.js
async function myNewApi(param) {
  const response = await apiClient.get(`/v2/my-endpoint/${param}`);
  return response.data;
}

module.exports = {
  // ...
  myNewApi,
};
```

---

## 工具函数

### 版本选择器

```javascript
const { selectVersion } = require('../utils/version-selector');

const version = await selectVersion(resourceId, resourceName);
if (!version) {
  // 用户取消
}
```

### 加密工具

```javascript
const { encrypt, decrypt } = require('../utils/crypto');

const encrypted = encrypt('my-token');
const decrypted = decrypt(encrypted);
```

### Spinner 动画

```javascript
const { startSpinner, succeedSpinner, failSpinner } = require('../utils/spinner');

const sp = startSpinner('加载中...');
sp.text = '更新中...';
succeedSpinner(sp, '成功');
// 或
failSpinner(sp, '失败');
```

---

## 精简对比

| 项目 | 精简前 | 精简后 | 改进 |
|------|--------|--------|------|
| 目录层级 | 5 层 | 4 层 | -20% |
| commands 子目录 | 6 个 | 1 个 | -83% |
| core 模块数 | 4 个 | 6 个 | 合并 constants |
| 总文件数 | 30+ | 23 | -23% |

**精简策略**:
1. ✅ 扁平化单文件命令（auth/init/publish/sync/analyze）
2. ✅ 合并 constants 到 core
3. ✅ 保留 dependency 子目录（文件较大，共6个文件）

---

**简洁！清晰！易维护！** 🚀
