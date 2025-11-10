# API 使用问题清单

## 🔍 检查结果

检查时间: 2025-11-10  
检查范围: `src/commands/` 和 `src/api/`

---

## ❌ 发现的问题

### 1. `src/api/update.ts` - 使用旧的 `apiClient`

**当前代码**:
```typescript
import apiClient from "../core/http";

export function createResourceVersion(
  resourceId: string,
  body: CreateResourceVersionBody
): Promise<ResourceVersionDetailResponse> {
  return apiClient.post(`/v2/resources/${resourceId}/versions`, body);
}
```

**问题**:
- ❌ 使用旧的 `apiClient` 而不是 `freelogRequest`
- ❌ 缺少 `async` 关键字
- ❌ 缺少官方文档链接
- ❌ 缺少参数注释
- ❌ 返回类型可能不正确（需要验证）

**需要修复**:
1. 迁移到 `freelogRequest`
2. 添加文档链接
3. 添加 JSDoc 注释
4. 验证返回类型

---

### 2. `src/commands/dependency/add.ts` - 使用旧的API方式

**当前代码**:
```typescript
import apiClient from '../../core/http';
import { readConfig, updateConfig } from '../../core/config';

const response = await apiClient.get(`/v2/resources/${parsed.value}`);
```

**问题**:
- ❌ 直接使用 `apiClient` 而不是封装的 API 函数
- ❌ 使用已废弃的 `readConfig/updateConfig`（应使用 `configService`）
- ❌ 没有使用 `getResourceInfo` 等封装好的 API
- ❌ 手动处理响应数据解包

**需要修复**:
1. 使用 `getResourceInfo` 替代直接调用
2. 使用 `getResourceVersionInfoList` 获取版本列表
3. 使用 `configService.loadConfig/saveConfig`
4. 使用封装好的类型

---

### 3. `src/commands/dependency/list.ts` - 数据类型不匹配

**当前代码 (第57行)**:
```typescript
console.log(chalk.green(`${index + 1}. ${dep.resourceName}`));
```

**问题**:
- ❌ `config.dependencies` 中的依赖对象没有 `resourceName` 字段
- ❌ 配置文件中的依赖只有 `{ resourceId, versionRange }`

**数据结构**:
```typescript
// freelog.ts 中的定义
dependencies?: {
  resourceId: string;
  versionRange: string;
}[];
```

**需要修复**:
1. 需要先通过 API 获取资源信息来得到 `resourceName`
2. 或者只显示 `resourceId`
3. 或者在配置中也保存 `resourceName`

---

### 4. `src/commands/dependency/remove.ts` - 需要检查

**状态**: 待检查  
**可能问题**: 可能也使用了旧的 config API

---

### 5. `src/commands/dependency/update.ts` - 需要检查

**状态**: 待检查  
**可能问题**: 可能使用旧的 API 调用方式

---

### 6. `src/commands/dependency/change.ts` - 需要检查

**状态**: 待检查  
**可能问题**: 可能使用旧的 API 调用方式

---

## ✅ 已验证正确的文件

### 1. `src/api/get.ts` ✅
- ✅ 使用 `freelogRequest`
- ✅ 有完整的文档链接
- ✅ 有 JSDoc 注释
- ✅ 类型定义正确

### 2. `src/api/user.ts` ✅
- ✅ 使用 `freelogRequest`
- ✅ 有文档链接
- ✅ 类型定义完整

### 3. `src/commands/sync.ts` ✅
- ✅ 正确使用 `getResourceVersionInfo`
- ✅ 使用 `configService.loadConfig/saveConfig`
- ✅ 类型使用正确

### 4. `src/commands/publish.ts` ✅
- ✅ 正确使用 `createResourceVersion`
- ✅ 使用 `configService.loadConfig`
- ✅ 类型使用正确

### 5. `src/commands/auth.ts` ✅
- ✅ 正确使用 `login/logout` API
- ✅ 正确获取响应头中的 token
- ✅ 类型使用正确

---

## 📋 修复计划

### 优先级 1 (高) - 核心 API

#### 1.1 修复 `src/api/update.ts`
- [ ] 迁移到 `freelogRequest`
- [ ] 添加 `async` 关键字
- [ ] 添加文档链接 `@see`
- [ ] 添加 JSDoc 注释
- [ ] 验证返回类型（根据官方文档）

#### 1.2 修复 `src/api/payment.ts`
- [ ] 检查是否使用 `freelogRequest`
- [ ] 验证返回类型

---

### 优先级 2 (中) - Commands

#### 2.1 修复 `src/commands/dependency/add.ts`
- [ ] 使用 `getResourceInfo` 替代直接 API 调用
- [ ] 使用 `getResourceVersionInfoList` 获取版本
- [ ] 使用 `configService.loadConfig/saveConfig`
- [ ] 移除旧的 `readConfig/updateConfig` 导入

#### 2.2 修复 `src/commands/dependency/list.ts`
- [ ] 解决 `resourceName` 不存在的问题
- [ ] 选项A: 调用 API 获取资源名称
- [ ] 选项B: 只显示 resourceId
- [ ] 选项C: 在配置中也保存 resourceName

#### 2.3 检查并修复其他 dependency 命令
- [ ] `remove.ts`
- [ ] `update.ts`
- [ ] `change.ts`

---

### 优先级 3 (低) - 其他

#### 3.1 检查 `src/commands/analyze.ts`
- [ ] 验证 API 使用
- [ ] 验证类型使用

#### 3.2 检查 `src/commands/init.ts`
- [ ] 验证配置文件生成
- [ ] 验证类型使用

---

## 🎯 类型验证

### 需要根据官方文档验证的返回类型

#### 1. 创建资源版本
- **文档**: https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
- **当前类型**: `ResourceVersionDetailResponse`
- **需要验证**: 返回字段是否完整

#### 2. 保存资源版本草稿
- **文档**: https://doc.freelog.com/resourceV2/%E4%BF%9D%E5%AD%98%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC%E8%8D%89%E7%A8%BF.html
- **当前类型**: `ResourceVersionDraftResponse`
- **需要验证**: 返回字段是否完整

#### 3. 支付相关
- **文档**: https://doc.freelog.com/contract-event-v2/%E4%BA%A4%E6%98%93%E4%BA%8B%E4%BB%B6.html
- **当前类型**: `PaymentEventResponse`, `IndividualAccountInfo`
- **状态**: 已验证 ✅

---

## 🔧 配置文件依赖问题

### 当前问题

`freelog.config.ts` 中的 dependencies 定义:
```typescript
dependencies?: {
  resourceId: string;
  versionRange: string;
}[];
```

但在 commands 中需要显示 `resourceName`，目前有两个选择：

### 解决方案 A: 动态获取（推荐）
在需要显示时通过 API 获取资源名称:
```typescript
const resourceInfo = await getResourceInfo(dep.resourceId);
console.log(resourceInfo.resourceName);
```

**优点**:
- 配置文件简洁
- 信息总是最新的

**缺点**:
- 需要额外的 API 调用
- 速度稍慢

### 解决方案 B: 配置中保存
在配置文件中也保存 resourceName:
```typescript
dependencies?: {
  resourceId: string;
  resourceName?: string;  // 添加这个
  versionRange: string;
}[];
```

**优点**:
- 不需要额外 API 调用
- 显示速度快

**缺点**:
- 配置文件冗余
- 可能过时（资源改名后）

---

## 📝 待办事项总结

### 立即修复 (高优先级)
1. ✅ `src/api/get.ts` - 已完成
2. ❌ `src/api/update.ts` - 需要重构
3. ❌ `src/commands/dependency/add.ts` - 需要重构
4. ❌ `src/commands/dependency/list.ts` - 需要修复数据显示

### 近期修复 (中优先级)
5. ❌ `src/commands/dependency/remove.ts` - 需要检查
6. ❌ `src/commands/dependency/update.ts` - 需要检查
7. ❌ `src/commands/dependency/change.ts` - 需要检查

### 验证和优化 (低优先级)
8. ❌ 验证所有 API 返回类型与文档一致
9. ❌ 统一错误处理方式
10. ❌ 添加单元测试

---

## 🎯 预期结果

### 修复后的状态
- ✅ 所有 API 文件使用 `freelogRequest`
- ✅ 所有 API 都有文档链接
- ✅ 所有 commands 使用封装好的 API 函数
- ✅ 所有类型定义正确
- ✅ 数据访问一致性
- ✅ 无类型错误
- ✅ 无 linter 警告

---

**检查完成时间**: 2025-11-10  
**待修复项目**: 7+ 个  
**优先级**: 高

