# 批量管理与单独资源管理一致性分析

## 当前问题

1. **策略管理不一致**：
   - 单独资源：使用 `resourceConfigToUpdateBody` + `calculatePolicyChanges` 处理策略更新
   - 批量资源：直接调用 `updateResource({ policies })`，但 `UpdateResourceBody` 不支持直接传入 `policies`，导致类型错误

2. **依赖管理不一致**：
   - 单独资源：使用 `dependencyAddService` 的通用逻辑，支持签约和支付流程
   - 批量资源：需要创建临时版本配置文件，逻辑复杂且不完整

3. **代码重复**：
   - 批量资源和单独资源有很多相似的逻辑，但没有抽取公共部分

## 设计原则

1. **批量资源 = 单独资源 + 批量配置管理**
   - 批量资源中的每个资源操作应该与单独资源完全一致
   - 只是操作不同的配置文件（批量配置 vs 单独配置）
   - 批量操作只是循环调用单个资源的操作

2. **抽取公共服务**：
   - 策略管理：抽取到 `policyService`
   - 依赖管理：已有 `dependencyAddService`，需要完善批量资源的使用方式
   - 资源操作：抽取通用的资源操作服务

## 重构方案

### 1. 策略管理统一化

#### 当前单独资源策略管理流程：
```
loadResourceConfig -> calculatePolicyChanges -> resourceConfigToUpdateBody -> updateResource
```

#### 批量资源应该复用相同流程：
```
loadBatchResourceConfig -> 获取单个资源 -> 
  转换为 ResourceConfig -> calculatePolicyChanges -> resourceConfigToUpdateBody -> updateResource
```

#### 需要创建的服务：
- `policyService.ts`：统一的策略管理服务
  - `updatePolicyStatus(resourceId, policies, changes)`：更新策略状态
  - `getPolicyChanges(localPolicies, remotePolicies)`：计算策略变更
  - `buildPolicyUpdateBody(resourceConfig, policyChanges)`：构建更新请求体

### 2. 依赖管理统一化

#### 当前单独资源依赖管理：
- 使用 `dependencyAddService` 的通用逻辑
- 支持签约和支付流程

#### 批量资源应该：
- 复用 `dependencyAddService` 的逻辑
- 为批量资源中的每个资源创建临时版本配置
- 或者：在批量配置中直接管理版本配置信息

#### 需要改进：
- `batchResourceService.ts`：添加 `getVersionConfigForBatchItem` 方法
- 或者：在批量配置中直接存储版本配置路径

### 3. 资源操作统一化

#### 需要抽取的公共操作：
- 资源信息更新（update）
- 版本信息更新（updateVersion）
- 资源同步（sync）
- 版本同步（syncVersion）
- 资源上下线（online/offline）

#### 创建统一服务：
- `resourceOperationService.ts`：
  - `updateResourceInfo(resourceId, config, options)`：更新资源信息
  - `updateVersionInfo(resourceId, versionConfig, options)`：更新版本信息
  - `syncResourceInfo(resourceId, config)`：同步资源信息
  - `syncVersionInfo(resourceId, versionConfig)`：同步版本信息
  - `setResourceStatus(resourceId, status)`：设置资源状态

### 4. 批量操作模式

批量操作应该遵循以下模式：

```typescript
// 1. 加载批量配置
const batchConfig = await loadBatchResourceConfig();

// 2. 选择要操作的资源（交互式或指定）
const resourcesToProcess = selectResources(batchConfig, options);

// 3. 对每个资源执行操作（复用单独资源的逻辑）
for (const item of resourcesToProcess) {
  // 转换为单独资源的配置格式
  const resourceConfig = batchItemToResourceConfig(item);
  const versionConfig = batchItemToVersionConfig(item);
  
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
```

## 具体重构计划

### Phase 1: 创建公共服务

1. **创建 `policyService.ts`**
   - 抽取策略管理逻辑
   - 支持单独资源和批量资源

2. **完善 `dependencyAddService.ts`**
   - 支持批量资源的版本配置
   - 或者创建 `batchDependencyService.ts` 包装器

3. **创建 `resourceOperationService.ts`**
   - 统一资源操作接口
   - 支持单独资源和批量资源

### Phase 2: 重构批量命令

1. **重构 `batch/policy/list.ts`**
   - 使用 `policyService` 统一处理策略
   - 复用单独资源的策略管理逻辑

2. **重构 `batch/dep/add.ts`**
   - 使用 `dependencyAddService` 的通用逻辑
   - 简化临时配置文件处理

3. **重构其他批量命令**
   - `batch/update.ts`：使用 `resourceOperationService`
   - `batch/update-version.ts`：使用 `resourceOperationService`
   - `batch/sync.ts`：使用 `resourceOperationService`
   - `batch/sync-version.ts`：使用 `resourceOperationService`
   - `batch/online.ts`：使用 `resourceOperationService`
   - `batch/offline.ts`：使用 `resourceOperationService`

### Phase 3: 确保一致性

1. **对比单独资源和批量资源的操作流程**
2. **确保所有功能都一致**
3. **统一错误处理和用户提示**

## 文件结构

```
src/
├── services/
│   ├── policyService.ts          # 新增：统一策略管理服务
│   ├── resourceOperationService.ts  # 新增：统一资源操作服务
│   ├── dependencyAddService.ts   # 已有：依赖添加服务（需要完善批量支持）
│   ├── batchResourceService.ts  # 已有：批量资源配置服务
│   ├── resourceConfigService.ts  # 已有：单独资源配置服务
│   └── versionConfigService.ts   # 已有：版本配置服务
├── commands/
│   ├── policy/
│   │   └── list.ts               # 单独资源策略管理
│   ├── dependency/
│   │   ├── add.ts                # 单独资源依赖管理
│   │   └── list.ts               # 单独资源依赖列表
│   └── batch/
│       ├── policy/
│       │   └── list.ts           # 批量资源策略管理（使用 policyService）
│       └── dep/
│           ├── add.ts            # 批量资源依赖管理（使用 dependencyAddService）
│           └── list.ts            # 批量资源依赖列表
```

## 关键点

1. **批量资源操作 = 循环调用单独资源操作**
2. **配置文件转换**：批量配置 ↔ 单独配置
3. **服务层统一**：所有操作都通过服务层，命令层只负责交互
4. **保持一致性**：批量资源和单独资源的操作体验完全一致

