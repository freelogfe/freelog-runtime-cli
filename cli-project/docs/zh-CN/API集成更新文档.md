# Freelog API 集成更新文档

## 📅 更新时间
2025-10-30

## 📚 参考文档
- [查看单个资源详情](https://doc.freelog.com/resourceV2/%E6%9F%A5%E7%9C%8B%E5%8D%95%E4%B8%AA%E8%B5%84%E6%BA%90%E8%AF%A6%E6%83%85.html)
- [交易事件处理](https://doc.freelog.com/contract-event-v2/%E4%BA%A4%E6%98%93%E4%BA%8B%E4%BB%B6.html)

---

## 🎯 更新概述

根据 [Freelog 官方API文档](https://doc.freelog.com)，完善了CLI工具的API集成，确保正确使用Freelog API规范的响应格式和错误处理。

---

## 一、Freelog API 响应格式

### 1. 统一响应结构

根据官方文档，所有 Freelog API 返回统一格式：

```json
{
  "ret": 0,
  "errcode": 0,
  "msg": "success",
  "data": {
    // 实际数据
  }
}
```

**字段说明**：
- `ret`: 返回码，`0` 表示成功
- `errcode`: 错误码（与 ret 类似）
- `msg`: 返回消息
- `data`: 实际的响应数据

### 2. 响应拦截器更新

更新了 `src/core/api.js` 中的响应拦截器：

```javascript
apiClient.interceptors.response.use(
  response => {
    const result = response.data;
    
    // 检查 Freelog API 返回码
    if (result.ret !== 0 && result.ret !== undefined) {
      throw new Error(result.msg || 'API请求失败');
    }
    
    // 返回完整的结果（包含 ret, msg, data）
    return result;
  },
  // ... 错误处理
);
```

---

## 二、资源信息接口

### 1. API 端点

```
GET https://api.freelog.com/v2/resources/{resourceIdOrName}
```

### 2. 请求参数

| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| resourceIdOrName | string | 必选 | 资源ID或资源名称（需encodeURIComponent） |
| isLoadPolicyInfo | int | 可选 | 是否加载策略详情 (0/1) |
| isLoadLatestVersionInfo | int | 可选 | 是否加载最新版本信息 (0/1) |
| isLoadFreezeReason | int | 可选 | 是否加载冻结原因 (0/1) |
| projection | string | 可选 | 自定义返回字段 |

### 3. 响应示例

```json
{
  "ret": 0,
  "msg": "success",
  "data": {
    "resourceId": "660a593b68659b002ec5793c",
    "resourceName": "12345676789/精选003",
    "resourceType": ["阅读", "文章"],
    "latestVersion": "1.0.0",
    "intro": "资源描述",
    "coverImages": [],
    "tags": [],
    "status": 1,
    "userId": 50028,
    "username": "12345676789",
    "resourceVersions": [
      {
        "version": "1.0.0",
        "versionId": "fc0ca8caa0e97d73c91af4d897e291f3",
        "createDate": "2024-04-01T06:50:43.785Z"
      }
    ],
    "baseUpcastResources": [],
    "policies": [...]
  }
}
```

### 4. 重要字段变化

| 旧字段 | 新字段 | 说明 |
|--------|--------|------|
| `description` | `intro` | 资源简介 |
| `resourceType` (string) | `resourceType` (array) | 资源类型变为数组 |

### 5. 代码更新

```javascript
// 获取资源信息
const result = await getResource(resourceIdOrName);
const resource = result.data;

// 访问字段
console.log(resource.resourceName);  // 资源名称
console.log(resource.intro);         // 资源描述（不是 description）
console.log(resource.resourceType);  // 数组，如 ["阅读", "文章"]
console.log(resource.latestVersion); // 最新版本号
```

---

## 三、资源版本接口

### 1. API 端点

```
GET https://api.freelog.com/v2/resources/{resourceId}/versions/{version}
```

### 2. 版本获取策略

```javascript
async function getResourceVersion(resourceId, version = 'latest') {
  // 如果是 latest，先获取资源信息找到最新版本
  if (version === 'latest') {
    const result = await apiClient.get(`/v2/resources/${resourceId}`);
    const resource = result.data;
    version = resource.latestVersion || resource.version;
  }
  
  // 获取指定版本信息
  const result = await apiClient.get(
    `/v2/resources/${resourceId}/versions/${version}`
  );
  return result;
}
```

### 3. 响应数据处理

```javascript
const versionInfo = await getResourceVersion(resourceId, 'latest');
const versionData = versionInfo.data;

console.log(versionData.version);                    // 版本号
console.log(versionData.description);                // 版本描述
console.log(versionData.dependencies);               // 依赖列表
console.log(versionData.customPropertyDescriptors); // 自定义属性
console.log(versionData.baseUpcastResources);       // 基础上抛
```

---

## 四、交易事件接口

### 1. API 端点

```
POST https://api.freelog.com/v2/contracts/{contractId}/events/payment
```

### 2. 请求参数

**URL参数**：
| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| contractId | string | 必选 | 合同ID |

**Body参数**：
| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| eventId | string | 必选 | 事件ID |
| accountId | string | 必选 | 付款账户 |
| transactionAmount | number | 必选 | 付款金额（最多2位小数） |
| password | string | 必选 | 账户支付密码（6位数字） |

### 3. 响应格式

```json
{
  "ret": 0,
  "msg": "success",
  "data": {
    "transactionRecordId": "87463a24a6da437aa98eb438167783e5",
    "status": 1
  }
}
```

**status 状态说明**：
- `1`: 交易确认中
- `2`: 交易成功
- `3`: 交易取消
- `4`: 交易失败

### 4. 交易失败错误码

| 错误码 | 说明 |
|--------|------|
| E1002 | 认证错误 |
| E1003 | 授权错误 |
| E1004 | 交易账户未找到 |
| E1005 | 交易账户未激活 |
| E1006 | 交易账户被冻结 |
| E1009 | 余额不足 |
| E1010 | 交易密码错误 |
| E1013 | 发起方与收款方账户一致 |
| E1014 | 交易被重复确认 |
| E1015 | 交易金额校验失败 |

### 5. 代码实现

```javascript
/**
 * 处理支付事件
 */
async function processPaymentEvent(contractId, paymentData) {
  const result = await apiClient.post(
    `/v2/contracts/${contractId}/events/payment`,
    paymentData
  );
  
  return result;
}

// 使用示例
const paymentResult = await processPaymentEvent(contractId, {
  eventId: 'evt_123456',
  accountId: 'acc_789',
  transactionAmount: 99.99,
  password: '123456'
});

if (paymentResult.data.status === 2) {
  console.log('支付成功');
} else if (paymentResult.data.status === 4) {
  console.log('支付失败:', paymentResult.data.code);
}
```

---

## 五、命令更新说明

### 1. Sync 命令

**数据提取方式更新**：

```javascript
// 旧方式（错误）
const resourceInfo = await getResource(resourceId);
console.log(resourceInfo.resourceName);  // undefined

// 新方式（正确）
const result = await getResource(resourceId);
const resourceInfo = result.data;
console.log(resourceInfo.resourceName);  // ✓
```

**完整示例**：

```javascript
async function initializeSync(resourceIdentifier) {
  // 获取资源信息
  const result = await getResource(resourceIdentifier);
  
  if (!result || !result.data) {
    throw new Error('资源信息获取失败');
  }
  
  const resource = result.data;
  
  // 创建配置
  const config = {
    workId: resource.resourceId,
    name: resource.resourceName,
    description: resource.intro,  // 注意：是 intro 不是 description
    // ...
  };
}
```

### 2. Dependency Add 命令

**资源信息获取更新**：

```javascript
// 获取资源信息
const result = await getResource(parsed.value);
if (!result || !result.data) {
  throw new Error('资源信息获取失败');
}

const resourceInfo = result.data;

// 处理资源类型（数组）
const typeStr = Array.isArray(resourceInfo.resourceType) 
  ? resourceInfo.resourceType.join(', ')
  : resourceInfo.resourceType;

console.log(`资源类型: ${typeStr}`);

// 使用 intro 字段
console.log(`描述: ${resourceInfo.intro || '无'}`);
```

---

## 六、错误处理增强

### 1. API 错误码处理

```javascript
apiClient.interceptors.response.use(
  response => {
    const result = response.data;
    
    // 检查 Freelog 返回码
    if (result.ret !== 0 && result.ret !== undefined) {
      logger.error('Freelog API Error', {
        ret: result.ret,
        msg: result.msg,
        errcode: result.errcode
      });
      throw new Error(result.msg || 'API请求失败');
    }
    
    return result;
  },
  error => {
    // HTTP 状态码错误处理
    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          throw new FreelogError('AUTH_001');
        case 403:
          throw new FreelogError('AUTH_003');
        case 404:
          throw new FreelogError('DEP_001', data.msg);
        default:
          throw new FreelogError('NETWORK_001', data.msg);
      }
    }
  }
);
```

### 2. 统一错误提示

```javascript
try {
  const result = await getResource(resourceId);
  // 处理数据
} catch (err) {
  if (err instanceof FreelogError) {
    error(err.toString());
  } else {
    error(`操作失败: ${err.message}`);
  }
  process.exit(1);
}
```

---

## 七、测试要点

### 1. 资源信息获取测试

```bash
# 测试环境
export FREELOG_ENV=development
freelog-cli sync vue3-theme

# 验证：
# 1. resourceType 应该是数组
# 2. 使用 intro 而不是 description
# 3. 响应格式 { ret: 0, msg: "success", data: {...} }
```

### 2. 依赖添加测试

```bash
# 添加依赖
freelog-cli dep add resource-name

# 验证：
# 1. 资源信息正确显示
# 2. 策略列表正确获取
# 3. 签约流程正常
```

### 3. 版本信息测试

```bash
# 同步最新版本
freelog-cli sync --all

# 同步指定版本
freelog-cli sync --all --version 1.3.2

# 验证：
# 1. latest 版本正确解析
# 2. customPropertyDescriptors 正确同步
# 3. dependencies 正确同步
```

---

## 八、API 字段映射表

### 资源信息字段

| CLI 使用 | API 返回字段 | 类型 | 说明 |
|----------|-------------|------|------|
| workId | resourceId | string | 资源ID |
| name | resourceName | string | 资源名称 |
| description | intro | string | 资源描述 |
| version | latestVersion | string | 最新版本 |
| resourceType | resourceType | array | 资源类型（数组） |
| coverImages | coverImages | array | 封面图片 |
| tags | tags | array | 标签列表 |

### 版本信息字段

| CLI 使用 | API 返回字段 | 类型 | 说明 |
|----------|-------------|------|------|
| version | version | string | 版本号 |
| description | description | string | 版本描述 |
| dependencies | dependencies | array | 依赖列表 |
| customPropertyDescriptors | customPropertyDescriptors | array | 自定义属性 |
| baseUpcastResources | baseUpcastResources | array | 基础上抛 |
| resolveResources | resolveResources | array | 解决资源 |

---

## 九、相关文件

### 更新的文件
- `cli-project/src/core/api.js` - API响应处理
- `cli-project/src/commands/sync/index.js` - Sync命令数据提取
- `cli-project/src/commands/dependency/add.js` - 依赖添加数据处理

### 新增功能
- `processPaymentEvent()` - 支付事件处理接口

---

## 十、注意事项

### 1. 响应数据提取

⚠️ **始终从 `result.data` 提取数据**：

```javascript
// ❌ 错误
const resource = await getResource(id);
console.log(resource.resourceName);  // undefined

// ✓ 正确
const result = await getResource(id);
const resource = result.data;
console.log(resource.resourceName);  // 正确
```

### 2. 字段名称差异

⚠️ **注意字段名称变化**：

```javascript
// 资源描述
resource.intro  // ✓ 正确
resource.description  // ❌ 错误（这是版本描述）

// 资源类型
Array.isArray(resource.resourceType)  // ✓ 是数组
typeof resource.resourceType === 'string'  // ❌ 不是字符串
```

### 3. 版本号处理

⚠️ **latest 版本需要先查询**：

```javascript
// 不能直接请求 /versions/latest
// 需要先获取资源信息，找到 latestVersion 字段
if (version === 'latest') {
  const result = await getResource(resourceId);
  version = result.data.latestVersion;
}
```

---

## 十一、快速参考

### API 端点汇总

| 功能 | 端点 | 方法 |
|------|------|------|
| 获取资源信息 | `/v2/resources/{resourceIdOrName}` | GET |
| 获取版本信息 | `/v2/resources/{resourceId}/versions/{version}` | GET |
| 创建资源版本 | `/v2/resources/{workId}/versions` | POST |
| 保存草稿 | `/v2/resources/{workId}/versions/drafts` | POST |
| 上传文件 | `/v2/storages/files/upload` | POST |
| 支付事件 | `/v2/contracts/{contractId}/events/payment` | POST |

### 环境地址

| 环境 | API地址 |
|------|---------|
| 测试 | `http://api.testfreelog.com` |
| 生产 | `https://api.freelog.com` |

---

**文档版本**: v1.0.0  
**更新日期**: 2025-10-30  
**维护者**: AI Assistant

