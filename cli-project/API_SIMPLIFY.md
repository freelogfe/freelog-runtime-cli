# API 层精简指南

## 🎯 精简目标

**删除所有 API 函数封装，直接使用 axios 实例**

---

## ✅ 精简后的 api.js

**只保留**: axios 实例配置（329 行 → 56 行，-83%）

```javascript
// cli-project/src/core/api.js
const axios = require('axios');
const apiClient = axios.create({
  baseURL: API_CONFIG.baseURL,  // 自动切换 dev/prod
  timeout: 30000
});

// Token 自动注入
apiClient.interceptors.request.use(config => {
  const auth = getCurrentAuth();
  if (auth && auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`;
  }
  return config;
});

// Freelog API 统一响应处理
apiClient.interceptors.response.use(response => {
  const result = response.data;
  if (result.ret !== 0 && result.ret !== undefined) {
    throw new Error(result.msg || 'API请求失败');
  }
  return result;
});

module.exports = apiClient;
```

---

## ❌ 删除的 API 函数封装

以下所有函数都已删除（直接在命令中调用 API）:

```javascript
// 资源相关
getResource(resourceIdOrName)
getResourceVersion(resourceId, version)
getResourceVersionList(resourceId)

// 策略相关
getResourcePolicies(resourceId, version)
signContract(policyId, licenseeId)
processPaymentEvent(contractId, eventId, password)

// 依赖相关
getDependencies()

// 发布相关
uploadFileToOSS(file)
createDraft(params)
publishFormal(params)
```

---

## 📝 迁移指南

### 旧方式（❌ 删除）

```javascript
// 1. 导入 API 函数
const { getResource, getResourceVersion } = require('../core/api');

// 2. 调用函数
const resource = await getResource(resourceId);
const version = await getResourceVersion(resourceId, '1.0.0');
```

### 新方式（✅ 推荐）

```javascript
// 1. 导入 axios 实例
const apiClient = require('../core/api');

// 2. 直接调用 API
const resource = await apiClient.get(`/v2/resources/${resourceId}`);
const version = await apiClient.get(`/v2/resources/${resourceId}/versions/1.0.0`);

// 3. 使用响应数据
console.log(resource.data);  // result.data
```

---

## 🔄 API 调用对照表

| 旧 API 函数 | 新 axios 调用 |
|------------|--------------|
| `getResource(id)` | `apiClient.get(\`/v2/resources/${id}\`)` |
| `getResourceVersion(id, ver)` | `apiClient.get(\`/v2/resources/${id}/versions/${ver}\`)` |
| `getResourceVersionList(id)` | `apiClient.get(\`/v2/resources/${id}/versions\`)` |
| `getPolicies(id, ver)` | `apiClient.get(\`/v2/auths/${id}/policies?version=${ver}\`)` |
| `signContract(data)` | `apiClient.post('/v2/contracts/sign', data)` |
| `processPaymentEvent(cid, eid, data)` | `apiClient.post(\`/v2/contracts/${cid}/events/${eid}\`, data)` |

---

## 💡 直接调用的优势

### ✅ 优点

1. **更直观** - 一眼看出调用的是哪个 API
2. **更灵活** - 可以自由传递参数、headers
3. **更少抽象** - 减少一层函数调用
4. **更易调试** - 直接看到 HTTP 请求

### ❌ 删除封装的原因

1. **简单透传** - API 函数只是简单地透传参数
2. **没有复杂逻辑** - 没有数据转换或业务逻辑
3. **增加复杂度** - 需要维护函数签名和文档
4. **不够灵活** - 无法自由控制请求参数

---

## 📋 需要更新的文件

以下文件需要将 API 函数调用改为直接 axios 调用：

1. ✅ `src/utils/version-selector.js` - 已更新
2. `src/commands/sync.js`
3. `src/commands/dependency/add.js`
4. `src/commands/dependency/change.js`
5. `src/commands/dependency/update.js`
6. `src/commands/dependency/list.js`

---

## 🎯 迁移示例

### 示例 1: 获取资源信息

```javascript
// 旧代码 ❌
const { getResource } = require('../core/api');
const resource = await getResource(resourceId);
const data = resource.data;

// 新代码 ✅
const apiClient = require('../core/api');
const result = await apiClient.get(`/v2/resources/${resourceId}`);
const data = result.data;
```

### 示例 2: 获取版本列表

```javascript
// 旧代码 ❌
const { getResourceVersionList } = require('../core/api');
const versions = await getResourceVersionList(resourceId, {
  projection: 'version,createDate'
});

// 新代码 ✅
const apiClient = require('../core/api');
const result = await apiClient.get(`/v2/resources/${resourceId}/versions`, {
  params: {
    projection: 'version,createDate'
  }
});
const versions = result.data.dataList;
```

### 示例 3: 签约

```javascript
// 旧代码 ❌
const { signContract } = require('../core/api');
await signContract({
  policyId,
  licenseeId
});

// 新代码 ✅
const apiClient = require('../core/api');
await apiClient.post('/v2/contracts/sign', {
  policyId,
  licenseeId
});
```

---

## 🛡️ 错误处理

由于 apiClient 已配置响应拦截器，错误处理保持不变：

```javascript
try {
  const result = await apiClient.get('/v2/resources/xxx');
  console.log(result.data);
} catch (error) {
  // 错误已由拦截器统一处理
  console.error('API 错误:', error.message);
}
```

---

## 📊 精简成果

| 项目 | 精简前 | 精简后 | 改进 |
|------|--------|--------|------|
| api.js 行数 | 329 行 | 56 行 | **-83%** ⭐ |
| 导出函数数 | 10+ 个 | 0 个 | **-100%** ⭐ |
| 抽象层级 | 3 层 | 2 层 | -33% |
| 代码直观性 | 低 | 高 | ↑ |

---

## 🎯 核心原则

**API 层该做什么**:
- ✅ 配置 axios 实例
- ✅ Token 自动注入
- ✅ 统一响应/错误处理
- ✅ 环境自动切换

**API 层不该做什么**:
- ❌ 封装每个 API 端点
- ❌ 简单的参数透传
- ❌ 无业务逻辑的函数

---

**直接、简洁、清晰！** 🚀

最后更新：2025-11-03

