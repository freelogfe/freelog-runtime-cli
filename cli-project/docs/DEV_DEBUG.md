# 本地调试开发指南

## 🎯 目标

在本地开发环境中调试 CLI，包括：
- ✅ 使用本地命令（不发布到 npm）
- ✅ 使用本地模板
- ✅ 使用本地测试接口

---

## 📦 环境准备

### 1. 安装依赖

```bash
# 使用 pnpm 安装
pnpm install

# 或在项目根目录安装所有工作空间
cd ..
pnpm install
```

### 2. 检查 Node 版本

```bash
node --version  # 需要 >= 16.0.0
```

---

## 🔧 一、本地命令调试

### 方式 1: 直接运行（推荐）

不需要全局安装，直接运行本地代码：

```bash
# 在 cli-project 目录下
node src/index.js <command> [options]

# 示例
node src/index.js login
node src/index.js init my-project
node src/index.js add my-resource -sv
node src/index.js publish -d
```

### 方式 2: 使用 pnpm link（全局命令）

如果想在任何目录使用 `freelog-cli` 命令：

```bash
# 在 cli-project 目录下
pnpm link --global

# 现在可以全局使用
freelog-cli login
freelog-cli init test-project

# 取消链接
pnpm unlink --global
```

### 方式 3: package.json scripts

在 `package.json` 中添加调试脚本：

```json
{
  "scripts": {
    "dev": "node src/index.js",
    "dev:login": "node src/index.js login",
    "dev:init": "node src/index.js init test-project",
    "dev:publish": "node src/index.js publish -d"
  }
}
```

使用：

```bash
pnpm dev login
pnpm dev:login
pnpm dev:init
```

---

## 📁 二、本地模板调试

### 1. 模板位置

模板文件位于项目根目录：

```
freelog-runtime-cli/
└── templates/
    ├── package-js/
    ├── package-react/
    ├── package-vue/
    ├── vite-react/
    ├── vite-react-ts/
    ├── vite-vue/
    ├── vite-vue-ts/
    ├── webpack-react/
    ├── webpack-react-ts/
    ├── webpack-vue/
    └── webpack-vue-ts/
```

### 2. 修改模板获取逻辑

编辑 `src/commands/init.js`，使用本地模板路径：

```javascript
// src/commands/init.js

// 找到模板配置部分
const TEMPLATE_BASE_PATH = process.env.TEMPLATE_PATH || path.join(__dirname, '../../../templates');

const TEMPLATES = [
  {
    name: 'package-js',
    type: 'package',
    path: path.join(TEMPLATE_BASE_PATH, 'package-js/template'),
    description: 'JavaScript 组件包'
  },
  {
    name: 'package-react',
    type: 'package',
    path: path.join(TEMPLATE_BASE_PATH, 'package-react/template'),
    description: 'React 组件包'
  },
  // ... 其他模板
];
```

### 3. 使用环境变量指定模板路径

```bash
# Windows PowerShell
$env:TEMPLATE_PATH="D:\appinside\freelog-runtime-cli\templates"
node src/index.js init my-project

# Windows CMD
set TEMPLATE_PATH=D:\appinside\freelog-runtime-cli\templates
node src/index.js init my-project

# Linux/Mac
export TEMPLATE_PATH="/path/to/templates"
node src/index.js init my-project
```

### 4. 测试本地模板

```bash
# 初始化项目使用本地模板
node src/index.js init test-project

# 选择你修改的模板
# 检查生成的项目是否正确
cd test-project
ls -la
```

---

## 🌐 三、本地接口调试

### 1. 配置本地 API 地址

编辑 `src/core/constants.js`：

```javascript
// src/core/constants.js

const ENVIRONMENT = {
  // 当前环境
  current: process.env.FREELOG_ENV || process.env.NODE_ENV || 'development',
  
  // 本地开发环境（新增）
  local: {
    api: process.env.LOCAL_API || 'http://localhost:3000',  // 你的本地 API
    web: 'http://localhost:8080'
  },
  
  // 测试环境
  development: {
    api: 'http://api.testfreelog.com',
    web: 'https://test.freelog.com'
  },
  
  // 生产环境
  production: {
    api: 'https://api.freelog.com',
    web: 'https://freelog.com'
  }
};

// 获取当前环境的 API 地址
function getApiBaseURL() {
  const env = ENVIRONMENT.current;
  
  // 支持直接设置 API URL
  if (process.env.FREELOG_API_URL) {
    return process.env.FREELOG_API_URL;
  }
  
  // 优先使用 local 环境
  if (env === 'local') {
    return ENVIRONMENT.local.api;
  }
  
  if (env === 'development') {
    return ENVIRONMENT.development.api;
  }
  
  return ENVIRONMENT.production.api;
}
```

### 2. 使用本地 API

#### 方式 1: 环境变量（推荐）

```bash
# Windows PowerShell
$env:FREELOG_ENV="local"
$env:LOCAL_API="http://localhost:3000"
node src/index.js login

# 或直接设置 API URL
$env:FREELOG_API_URL="http://localhost:3000"
node src/index.js login
```

#### 方式 2: .env 文件

创建 `.env` 文件：

```bash
# cli-project/.env
FREELOG_ENV=local
LOCAL_API=http://localhost:3000
FREELOG_API_URL=http://localhost:3000
```

安装 dotenv：

```bash
pnpm add dotenv
```

在 `src/index.js` 顶部添加：

```javascript
// src/index.js
require('dotenv').config();

// 其他代码...
```

#### 方式 3: 配置文件

创建 `config.local.js`：

```javascript
// cli-project/config.local.js
module.exports = {
  api: 'http://localhost:3000',
  web: 'http://localhost:8080'
};
```

在 `src/core/constants.js` 中读取：

```javascript
// 尝试加载本地配置
let localConfig = {};
try {
  localConfig = require('../../config.local.js');
} catch (e) {
  // 没有本地配置文件
}

const ENVIRONMENT = {
  local: {
    api: localConfig.api || 'http://localhost:3000',
    web: localConfig.web || 'http://localhost:8080'
  },
  // ...
};
```

### 3. 测试本地接口

```bash
# 设置使用本地 API
$env:FREELOG_API_URL="http://localhost:3000"

# 测试登录
node src/index.js login

# 测试获取资源
node src/index.js add test-resource

# 查看请求日志（如果启用了 logger）
```

---

## 🐛 四、调试技巧

### 1. 启用调试日志

在 `src/core/logger.js` 中设置日志级别：

```javascript
// src/core/logger.js

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',  // 改为 debug
  // ...
});
```

使用：

```bash
$env:LOG_LEVEL="debug"
node src/index.js login
```

### 2. 使用 Node.js 调试器

```bash
# 使用 inspect
node --inspect src/index.js login

# 使用 inspect-brk（在第一行暂停）
node --inspect-brk src/index.js login
```

然后在 Chrome 打开 `chrome://inspect`

### 3. VSCode 调试配置

创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "调试 CLI - Login",
      "program": "${workspaceFolder}/cli-project/src/index.js",
      "args": ["login"],
      "env": {
        "FREELOG_ENV": "local",
        "FREELOG_API_URL": "http://localhost:3000",
        "LOG_LEVEL": "debug"
      },
      "console": "integratedTerminal"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "调试 CLI - Init",
      "program": "${workspaceFolder}/cli-project/src/index.js",
      "args": ["init", "test-project"],
      "env": {
        "FREELOG_ENV": "local",
        "TEMPLATE_PATH": "${workspaceFolder}/templates"
      },
      "console": "integratedTerminal"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "调试 CLI - Publish",
      "program": "${workspaceFolder}/cli-project/src/index.js",
      "args": ["publish", "-d"],
      "env": {
        "FREELOG_ENV": "local",
        "FREELOG_API_URL": "http://localhost:3000"
      },
      "console": "integratedTerminal"
    }
  ]
}
```

按 `F5` 开始调试。

### 4. 打印调试信息

```javascript
// 在代码中添加
console.log('DEBUG:', {
  env: process.env.FREELOG_ENV,
  api: API_CONFIG.baseURL,
  template: templatePath
});
```

### 5. 模拟 API 响应

使用 `axios-mock-adapter`：

```bash
pnpm add -D axios-mock-adapter
```

```javascript
// src/core/api.js (仅开发环境)
if (process.env.MOCK_API === 'true') {
  const MockAdapter = require('axios-mock-adapter');
  const mock = new MockAdapter(apiClient);
  
  // 模拟登录
  mock.onPost('/v2/passport/login').reply(200, {
    ret: 0,
    data: {
      username: 'test-user',
      userId: '123'
    }
  });
  
  // 模拟获取资源
  mock.onGet(/\/v2\/resources\/.*/).reply(200, {
    ret: 0,
    data: {
      resourceId: '123',
      resourceName: 'test-resource'
    }
  });
}
```

---

## 📝 五、完整调试流程示例

### 场景：调试 publish 命令

```bash
# 1. 设置环境变量
$env:FREELOG_ENV="local"
$env:FREELOG_API_URL="http://localhost:3000"
$env:LOG_LEVEL="debug"
$env:TEMPLATE_PATH="D:\appinside\freelog-runtime-cli\templates"

# 2. 先登录
node src/index.js login
# 输入本地测试账号

# 3. 初始化测试项目
node src/index.js init test-publish-project
cd test-publish-project

# 4. 修改 freelog.json（如果需要）
code freelog.json

# 5. 测试发布
node ../src/index.js publish -d

# 6. 查看日志
ls ~/.freelog/logs/
```

---

## 🔄 六、快速切换环境

创建批处理脚本：

### `dev-local.ps1` (本地环境)

```powershell
# cli-project/dev-local.ps1
$env:FREELOG_ENV="local"
$env:FREELOG_API_URL="http://localhost:3000"
$env:TEMPLATE_PATH="D:\appinside\freelog-runtime-cli\templates"
$env:LOG_LEVEL="debug"

Write-Host "✓ 已切换到本地开发环境" -ForegroundColor Green
Write-Host "API: http://localhost:3000" -ForegroundColor Cyan
```

### `dev-test.ps1` (测试环境)

```powershell
# cli-project/dev-test.ps1
$env:FREELOG_ENV="development"
$env:LOG_LEVEL="info"

Write-Host "✓ 已切换到测试环境" -ForegroundColor Green
Write-Host "API: http://api.testfreelog.com" -ForegroundColor Cyan
```

使用：

```bash
# 切换到本地环境
. .\dev-local.ps1
node src/index.js login

# 切换到测试环境
. .\dev-test.ps1
node src/index.js login
```

---

## 🛠️ 七、常用调试命令

```bash
# 查看当前环境
node -e "console.log('ENV:', process.env.FREELOG_ENV); console.log('API:', process.env.FREELOG_API_URL)"

# 测试 API 连接
curl http://localhost:3000/v2/resources/test

# 查看日志
Get-Content ~/.freelog/logs/combined.log -Tail 50

# 清除认证信息
Remove-Item -Recurse ~/.freelog/auth.json

# 清除工作空间认证
Remove-Item .freelog/auth.json
```

---

## 📋 八、调试检查清单

调试前确认：

- [ ] 已安装所有依赖 (`pnpm install`)
- [ ] Node 版本 >= 16
- [ ] 设置了正确的环境变量
- [ ] 本地 API 服务已启动
- [ ] 模板路径正确
- [ ] 日志级别设置为 debug
- [ ] 清除了旧的认证信息（如果需要）

---

## ⚠️ 常见问题

### 1. 模板找不到

```bash
# 检查模板路径
ls D:\appinside\freelog-runtime-cli\templates

# 确认环境变量
echo $env:TEMPLATE_PATH
```

### 2. API 连接失败

```bash
# 检查本地 API 是否启动
curl http://localhost:3000

# 检查环境变量
echo $env:FREELOG_API_URL
```

### 3. 命令不生效

```bash
# 清除 Node 缓存
Remove-Item -Recurse node_modules/.cache

# 重新安装依赖
pnpm install
```

---

## 📚 相关文档

- [快速开始](./QUICK_START.md)
- [项目架构](./ARCHITECTURE.md)
- [API 文档](./API_SIMPLIFY.md)

---

**Happy Debugging! 🎉**

最后更新：2025-11-03

