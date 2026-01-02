# 批量管理重构总结

## 已完成的工作

### 1. 创建统一的策略管理服务 ✅

**文件**: `src/services/policyService.ts`

**功能**:
- `getPolicyChanges()`: 计算策略变更（复用 `calculatePolicyChanges`）
- `buildPolicyUpdateBody()`: 构建策略更新请求体（复用 `resourceConfigToUpdateBody`）
- `updatePolicyStatus()`: 更新单个策略状态
- `batchUpdatePolicyStatus()`: 批量更新策略状态
- `updateAllPolicyStatus()`: 更新所有策略状态

**作用**: 统一单独资源和批量资源的策略管理逻辑

### 2. 修复批量策略管理 ✅

**文件**: `src/commands/batch/policy/list.ts`

**修复内容**:
- 修复了直接调用 `updateResource({ policies })` 的类型错误
- 使用 `policyService` 统一处理策略更新
- 复用单独资源的策略管理流程：
  1. 获取资源信息
  2. 构建资源配置
  3. 计算策略变更
  4. 构建更新请求体
  5. 调用更新 API

**现在的工作流程**:
```typescript
// 1. 获取资源信息
const resourceInfo = await getResourceInfo(item.resourceId);

// 2. 构建资源配置
const resourceConfig = batchItemToResourceConfig(item, defaults);
resourceConfig.policies = updatedPolicies.map(...);

// 3. 计算策略变更
const policyChanges = getPolicyChanges(resourceConfig.policies, resourceInfo.policies);

// 4. 构建更新请求体
const updateBody = buildPolicyUpdateBody(resourceConfig, policyChanges);

// 5. 更新资源
await updateResource(item.resourceId, updateBody);
```

## 待完成的工作

### 1. 依赖管理统一化 ⚠️

**当前问题**:
- 批量资源的依赖管理需要创建临时版本配置文件
- 逻辑复杂且不完整

**需要改进**:
- 完善 `batch/dep/add.ts`，更好地复用 `dependencyAddService`
- 或者：在批量配置中直接管理版本配置信息

### 2. 资源操作统一化 ⚠️

**需要创建**: `src/services/resourceOperationService.ts`

**功能**:
- `updateResourceInfo()`: 统一资源信息更新
- `updateVersionInfo()`: 统一版本信息更新
- `syncResourceInfo()`: 统一资源信息同步
- `syncVersionInfo()`: 统一版本信息同步
- `setResourceStatus()`: 统一资源状态设置

**作用**: 让批量资源操作完全复用单独资源的逻辑

### 3. 批量命令重构 ⚠️

需要重构的批量命令：
- `batch/update.ts`: 使用 `resourceOperationService`
- `batch/update-version.ts`: 使用 `resourceOperationService`
- `batch/sync.ts`: 使用 `resourceOperationService`
- `batch/sync-version.ts`: 使用 `resourceOperationService`
- `batch/online.ts`: 使用 `resourceOperationService`
- `batch/offline.ts`: 使用 `resourceOperationService`

## 一致性原则

### 核心原则

1. **批量资源 = 单独资源 + 批量配置管理**
   - 批量资源中的每个资源操作应该与单独资源完全一致
   - 只是操作不同的配置文件（批量配置 vs 单独配置）

2. **服务层统一**
   - 所有操作都通过服务层
   - 命令层只负责交互和循环调用

3. **配置文件转换**
   - 批量配置 ↔ 单独配置
   - 使用 `batchItemToResourceConfig` 和 `batchItemToVersionConfig`

### 标准流程

```typescript
// 批量操作的通用模式
async function executeBatchOperation(options) {
  // 1. 加载批量配置
  const batchConfig = await loadBatchResourceConfig();
  
  // 2. 选择要操作的资源
  const resourcesToProcess = selectResources(batchConfig, options);
  
  // 3. 对每个资源执行操作（复用单独资源的逻辑）
  for (const item of resourcesToProcess) {
    // 转换为单独资源的配置格式
    const resourceConfig = batchItemToResourceConfig(item, batchConfig.defaults);
    const versionConfig = batchItemToVersionConfig(item, batchConfig.defaults, item.resourceId);
    
    // 调用单独资源的服务函数
    await resourceOperationService.updateResourceInfo(
      item.resourceId,
      resourceConfig,
      options
    );
    
    // 更新批量配置
    updateBatchResourceItem(batchConfig, item.name, updates);
  }
  
  // 4. 保存批量配置
  await saveBatchResourceConfig(batchConfig);
}
```

## 文件结构

```
src/
├── services/
│   ├── policyService.ts          ✅ 已创建：统一策略管理服务
│   ├── resourceOperationService.ts  ⚠️ 待创建：统一资源操作服务
│   ├── dependencyAddService.ts   ✅ 已有：依赖添加服务（需要完善批量支持）
│   ├── batchResourceService.ts  ✅ 已有：批量资源配置服务
│   ├── resourceConfigService.ts  ✅ 已有：单独资源配置服务
│   └── versionConfigService.ts   ✅ 已有：版本配置服务
├── commands/
│   ├── policy/
│   │   └── list.ts               ✅ 单独资源策略管理
│   ├── dependency/
│   │   ├── add.ts                ✅ 单独资源依赖管理
│   │   └── list.ts               ✅ 单独资源依赖列表
│   └── batch/
│       ├── policy/
│       │   └── list.ts           ✅ 已修复：批量资源策略管理
│       └── dep/
│           ├── add.ts            ⚠️ 待完善：批量资源依赖管理
│           └── list.ts           ✅ 批量资源依赖列表
```

## 下一步计划

1. **创建 `resourceOperationService.ts`**
   - 统一资源操作接口
   - 支持单独资源和批量资源

2. **重构批量命令**
   - 使用 `resourceOperationService` 统一处理
   - 确保与单独资源操作一致

3. **完善依赖管理**
   - 改进批量资源的依赖添加逻辑
   - 更好地复用 `dependencyAddService`

4. **测试和验证**
   - 确保批量资源和单独资源的操作完全一致
   - 统一错误处理和用户提示

