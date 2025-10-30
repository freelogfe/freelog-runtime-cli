# 环境配置与 Sync 命令更新文档

## 更新时间
2025-10-30

## 更新概述
实现了测试环境和生产环境的自动切换，完善了 `sync` 命令以正确使用 Freelog API 并匹配实际的 `freelog.json` 格式。

---

## 一、环境配置

### 1. 环境类型

**支持的环境**：
- `development` - 测试环境
- `production` - 生产环境（默认）

### 2. 环境配置

```javascript
// cli-project/src/constants/config.js

const ENVIRONMENT = {
  // 当前环境
  current: process.env.FREELOG_ENV || process.env.NODE_ENV || 'production',
  
  // 测试环境配置
  development: {
    api: 'http://api.testfreelog.com',
    web: 'https://test.freelog.com'
  },
  
  // 生产环境配置
  production: {
    api: 'https://api.freelog.com',
    web: 'https://freelog.com'
  }
};
```

### 3. 环境切换

**方式一：环境变量**
```bash
# Windows (CMD)
set FREELOG_ENV=development
freelog-cli login

# Windows (PowerShell)
$env:FREELOG_ENV="development"
freelog-cli login

# Linux/Mac
export FREELOG_ENV=development
freelog-cli login

# 或使用 NODE_ENV
export NODE_ENV=development
freelog-cli login
```

**方式二：指定 API 地址**
```bash
# 自定义 API 地址
export FREELOG_API_URL=http://custom-api.freelog.com
freelog-cli login
```

**方式三：.env 文件**
```env
# .env
FREELOG_ENV=development
# 或
NODE_ENV=development
# 或自定义
FREELOG_API_URL=http://api.testfreelog.com
```

### 4. 环境判断逻辑

```javascript
function getApiBaseURL() {
  // 优先使用自定义 API 地址
  if (process.env.FREELOG_API_URL) {
    return process.env.FREELOG_API_URL;
  }
  
  // 根据环境变量选择
  const env = ENVIRONMENT.current === 'development' 
    ? 'development' 
    : 'production';
    
  return ENVIRONMENT[env].api;
}
```

---

## 二、API 端点配置

### 1. 统一端点管理

```javascript
const API_CONFIG = {
  baseURL: getApiBaseURL(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  },
  
  // API 端点
  endpoints: {
    // 认证
    login: '/v2/passport/login',
    
    // 资源
    resources: '/v2/resources',
    resource: '/v2/resources/{resourceIdOrName}',
    resourceVersions: '/v2/resources/{workId}/versions',
    resourceVersion: '/v2/resources/{resourceId}/versions/{version}',
    resourceDrafts: '/v2/resources/{workId}/versions/drafts',
    
    // 文件上传
    fileUpload: '/v2/storages/files/upload',
    
    // 依赖
    dependencies: '/v2/resources/{resourceId}/versions/{version}/dependencies'
  }
};
```

### 2. 主要 API 端点

#### 资源信息接口
```
GET https://api.freelog.com/v2/resources/{resourceIdOrName}
```

**参数**：
- `resourceIdOrName` - 资源ID或资源名称

**响应格式**：
```json
{
  "ret": 0,
  "msg": "success",
  "data": {
    "resourceId": "6768d232d83d52002f6b0f59",
    "resourceName": "vue3-theme",
    "resourceType": ["theme"],
    "intro": "资源描述",
    "coverImages": [],
    "tags": [],
    "latestVersion": "1.3.2"
  }
}
```

#### 版本信息接口
```
GET https://api.freelog.com/v2/resources/{resourceId}/versions/{version}
```

**参数**：
- `resourceId` - 资源ID
- `version` - 版本号（可以使用 'latest' 获取最新版本）

**响应格式**：
```json
{
  "ret": 0,
  "msg": "success",
  "data": {
    "version": "1.3.2",
    "description": "版本描述",
    "dependencies": [],
    "baseUpcastResources": [],
    "resolveResources": [],
    "customPropertyDescriptors": [
      {
        "type": "readonlyText",
        "key": "aab",
        "name": "补充属性",
        "remark": "补充属性",
        "defaultValue": "aaaa"
      }
    ]
  }
}
```

---

## 三、Sync 命令更新

### 1. freelog.json 格式

**实际格式**（匹配示例文件）：
```json
{
  "version": "1.3.2",
  "workId": "6768d232d83d52002f6b0f59",
  "name": "vue3-theme",
  "publishPath": "dist",
  "baseUpcastResources": [],
  "dependencies": [],
  "resolveResources": [],
  "inputAttrs": [],
  "customPropertyDescriptors": [
    {
      "type": "readonlyText",
      "key": "aab",
      "name": "补充属性",
      "remark": "补充属性",
      "defaultValue": "aaaa"
    }
  ],
  "description": "资源描述"
}
```

**字段说明**：
- `version` - 当前版本号
- `workId` - 资源ID（必需）
- `name` - 资源名称
- `publishPath` - 发布路径（默认 "dist"）
- `baseUpcastResources` - 基础上抛资源
- `dependencies` - 依赖列表
- `resolveResources` - 解决资源
- `inputAttrs` - 输入属性（与 customPropertyDescriptors 同步）
- `customPropertyDescriptors` - 自定义属性描述
- `description` - 资源描述

### 2. Sync 命令用法

#### 初始化同步（创建 freelog.json）
```bash
# 从线上资源创建配置文件
freelog-cli sync <resourceIdOrName>

# 示例
freelog-cli sync vue3-theme
freelog-cli sync 6768d232d83d52002f6b0f59

# 指定版本
freelog-cli sync vue3-theme@1.3.2
```

**执行流程**：
1. 调用 API 获取资源信息
2. 获取指定版本或最新版本的信息
3. 创建 `freelog.json` 配置文件
4. 如果文件已存在，询问是否覆盖

#### 同步作品信息
```bash
# 同步作品基本信息（名称、描述等）
freelog-cli sync --work
freelog-cli sync -w
```

#### 同步所有信息
```bash
# 同步所有信息（使用最新版本）
freelog-cli sync --all
freelog-cli sync -a

# 同步指定版本的所有信息
freelog-cli sync --all --version 1.3.2
freelog-cli sync -a -v 1.3.2

# 强制覆盖（不合并）
freelog-cli sync --all --force
```

#### 同步部分信息
```bash
# 同步自定义属性
freelog-cli sync --props

# 同步依赖配置
freelog-cli sync --config

# 同步描述信息
freelog-cli sync --changelog

# 组合使用
freelog-cli sync --props --config --version 1.3.2
```

#### 交互式同步
```bash
# 不带参数，进入交互式模式
freelog-cli sync
```

**交互流程**：
1. 选择要同步的内容（多选）
   - 作品基本信息
   - 自定义属性
   - 依赖配置
   - 描述信息
2. 输入版本号（默认最新版本）
3. 执行同步

### 3. API 调用流程

#### 初始化同步
```javascript
// 1. 获取资源信息
GET /v2/resources/{resourceIdOrName}

// 2. 获取版本信息
GET /v2/resources/{resourceId}/versions/{version}

// 3. 创建配置文件
{
  version: versionData.version,
  workId: resource.resourceId,
  name: resource.resourceName,
  publishPath: 'dist',
  description: versionData.description || resource.intro,
  baseUpcastResources: versionData.baseUpcastResources || [],
  dependencies: versionData.dependencies || [],
  resolveResources: versionData.resolveResources || [],
  inputAttrs: versionData.customPropertyDescriptors || [],
  customPropertyDescriptors: versionData.customPropertyDescriptors || []
}
```

#### 同步作品信息
```javascript
// 1. 读取本地配置
const config = readConfig();

// 2. 获取资源信息
GET /v2/resources/{config.workId}

// 3. 更新配置
config.name = resource.resourceName;
config.description = resource.intro;
```

#### 同步所有信息
```javascript
// 1. 获取资源信息
GET /v2/resources/{config.workId}

// 2. 获取版本信息
GET /v2/resources/{config.workId}/versions/{version}

// 3. 合并或覆盖配置
const updates = {
  version: versionData.version,
  name: resource.resourceName,
  description: versionData.description,
  baseUpcastResources: versionData.baseUpcastResources,
  dependencies: versionData.dependencies,
  resolveResources: versionData.resolveResources,
  customPropertyDescriptors: versionData.customPropertyDescriptors,
  inputAttrs: versionData.customPropertyDescriptors
};
```

### 4. 响应数据处理

**API 响应结构**：
```javascript
{
  ret: 0,        // 返回码，0 表示成功
  msg: "success", // 消息
  data: {        // 实际数据
    // 资源或版本信息
  }
}
```

**数据提取**：
```javascript
const resourceInfo = await getResource(resourceId);
if (!resourceInfo || !resourceInfo.data) {
  throw new Error('资源信息获取失败');
}
const resource = resourceInfo.data;
```

---

## 四、使用示例

### 示例 1：在测试环境初始化项目

```bash
# 1. 设置测试环境
export FREELOG_ENV=development

# 2. 登录测试环境
freelog-cli login -g

# 3. 从测试环境的资源创建配置
freelog-cli sync test-resource-name

# 4. 查看生成的配置文件
cat freelog.json
```

### 示例 2：同步生产环境资源到本地

```bash
# 1. 使用生产环境（默认）
export FREELOG_ENV=production

# 2. 登录
freelog-cli login -g

# 3. 初始化配置
freelog-cli sync vue3-theme

# 4. 后续同步更新
freelog-cli sync --all --version 1.3.2
```

### 示例 3：在不同环境发布

```bash
# 测试环境发布
export FREELOG_ENV=development
freelog-cli publish --draft

# 生产环境发布
export FREELOG_ENV=production
freelog-cli publish --patch -m "正式发布"
```

### 示例 4：交互式同步特定内容

```bash
# 进入交互模式
freelog-cli sync

# 交互流程：
# ? 请选择要同步的内容:
#   ✓ 作品基本信息
#   ✓ 自定义属性
#   ✓ 依赖配置
#     描述信息
# ? 请输入版本号（留空使用最新版本）: latest

# 输出：
# ✓ 同步成功
# ✓ 已同步 3 项内容
# ✓ 版本: 1.3.2
```

---

## 五、环境变量优先级

1. `FREELOG_API_URL` - 最高优先级，直接指定 API 地址
2. `FREELOG_ENV` - 选择环境配置（development/production）
3. `NODE_ENV` - 作为 `FREELOG_ENV` 的备选
4. 默认值 - `production`

**示例**：
```bash
# 优先级演示
export FREELOG_ENV=development           # api.testfreelog.com
export FREELOG_API_URL=http://custom.api # 覆盖，使用 custom.api
```

---

## 六、配置文件对比

### 旧版格式（不再使用）
```json
{
  "version": "1.0.0",
  "type": "object",
  "local": {
    "buildDir": "./dist",
    "entryFile": "./dist/index.html",
    "excludes": ["node_modules"]
  },
  "resource": {
    "resourceId": "xxx",
    "resourceName": "xxx",
    "resourceType": "theme"
  },
  "properties": [],
  "customOptions": []
}
```

### 新版格式（当前使用）
```json
{
  "version": "1.3.2",
  "workId": "6768d232d83d52002f6b0f59",
  "name": "vue3-theme",
  "publishPath": "dist",
  "baseUpcastResources": [],
  "dependencies": [],
  "resolveResources": [],
  "inputAttrs": [],
  "customPropertyDescriptors": [],
  "description": "资源描述"
}
```

**主要差异**：
- `resource.resourceId` → `workId`
- `resource.resourceName` → `name`
- 移除了 `type`、`local` 嵌套结构
- `properties` → `customPropertyDescriptors`
- `customOptions` → `inputAttrs`
- 新增 `publishPath`、`baseUpcastResources`、`resolveResources`

---

## 七、常见问题

### Q1: 如何确认当前使用的环境？
```bash
# 查看环境变量
echo $FREELOG_ENV
echo $NODE_ENV
echo $FREELOG_API_URL

# 或在代码中查看
node -e "console.log(process.env.FREELOG_ENV || process.env.NODE_ENV || 'production')"
```

### Q2: sync 命令提示资源不存在？
- 检查 `resourceIdOrName` 是否正确
- 确认当前环境（测试/生产）是否匹配
- 测试环境的资源在生产环境可能不存在

### Q3: freelog.json 中 workId 从哪里来？
- 方式1：使用 `sync` 命令自动获取
- 方式2：从 Freelog 平台复制资源ID
- 方式3：查看现有资源的 URL（包含 workId）

### Q4: 如何在 CI/CD 中使用不同环境？
```yaml
# GitHub Actions 示例
- name: Publish to test
  env:
    FREELOG_ENV: development
  run: |
    freelog-cli login -u ${{ secrets.TEST_USER }} -p ${{ secrets.TEST_PASS }}
    freelog-cli publish --draft

- name: Publish to production
  env:
    FREELOG_ENV: production
  run: |
    freelog-cli login -u ${{ secrets.PROD_USER }} -p ${{ secrets.PROD_PASS }}
    freelog-cli publish --patch
```

---

## 八、相关文件

### 更新的文件
- `cli-project/src/constants/config.js` - 环境配置
- `cli-project/src/core/api.js` - API 端点更新
- `cli-project/src/commands/sync/index.js` - Sync 命令重构

### 相关文档
- `TOKEN_ENCRYPTION_UPDATE.md` - Token 加密
- `PUBLISH_COMMAND_UPDATE.md` - 发布命令
- `LATEST_UPDATES_SUMMARY.md` - 更新总结

---

## 九、测试清单

- [x] 测试环境切换
- [x] 生产环境切换
- [x] 自定义 API 地址
- [x] sync 初始化
- [x] sync 同步作品信息
- [x] sync 同步所有信息
- [x] sync 交互式同步
- [x] API 响应数据解析
- [x] freelog.json 格式正确性

---

**更新人员**: AI Assistant  
**版本**: v1.0.0  
**更新日期**: 2025-10-30

