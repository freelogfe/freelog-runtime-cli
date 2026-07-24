# 批量管理与单独资源管理本质分析

## 核心理解

**批量管理和单独资源管理的本质没有区别，只是操作方式不同：**

1. **配置文件不同**
   - 单独资源：`freelog.resource.config.js/ts` + `freelog.version.config.js/ts`
   - 批量资源：`freelog.batch-resources.config.js/ts`（包含多个资源的信息）

2. **批量操作能力**
   - 批量创建资源：`batch create`
   - 批量更新资源：`batch update`
   - 批量发布版本：`batch publish`

3. **批量特有功能**
   - 从合集同步：`batch load-from-collection` - 从合集的单品列表同步到批量配置
   - 添加到合集：`batch add-to-collection` - 批量添加到合集中

4. **单个资源操作**
   - 批量中的单个资源操作 = 单独资源的操作
   - 只是操作不同的配置文件
   - 操作逻辑完全一致

## 命令对比

### 依赖管理

| 操作 | 单独资源 | 批量资源（单个资源操作） | 状态 |
|------|---------|----------------------|------|
| 添加依赖 | `dep add <dependencyId>` | `batch dep add <resourceName> <dependencyId>` | ✅ 已有 |
| 查看依赖 | `dep list` | `batch dep list [resourceName]` | ✅ 已有 |
| 移除依赖 | `dep remove <dependencyId>` | `batch dep remove <resourceName> <dependencyId>` | ❌ 缺失 |
| 更新依赖 | `dep update <dependencyId> [versionRange]` | `batch dep update <resourceName> <dependencyId> [versionRange]` | ❌ 缺失 |
| 修改依赖 | `dep change <dependencyId> [versionRange]` | `batch dep change <resourceName> <dependencyId> [versionRange]` | ❌ 缺失（update的别名） |
| 同步依赖 | `dep sync [targetVersion]` | `batch dep sync <resourceName> [targetVersion]` | ❌ 缺失 |

### 策略管理

| 操作 | 单独资源 | 批量资源（单个资源操作） | 状态 |
|------|---------|----------------------|------|
| 添加策略 | `policy add` | `batch policy add <resourceName>` | ❌ 缺失 |
| 查看策略 | `policy list` | `batch policy list [resourceName]` | ✅ 已有 |

## 实现原则

### 1. 单个资源操作 = 单独资源操作

对于批量配置中的单个资源，操作应该和单独资源完全一致：

```typescript
// 单独资源：dep add <dependencyId>
// 批量资源：batch dep add <resourceName> <dependencyId>

// 实现方式：
// 1. 从批量配置中找到指定的资源
// 2. 转换为单独资源的配置格式（临时）
// 3. 调用单独资源的服务函数
// 4. 更新批量配置
```

### 2. 批量操作 = 循环调用单个资源操作

批量操作只是循环调用单个资源的操作：

```typescript
// batch create, batch update, batch publish 等
for (const item of resourcesToProcess) {
  // 转换为单独资源的配置格式
  const resourceConfig = batchItemToResourceConfig(item, defaults);
  
  // 调用单独资源的服务函数
  await createResource(resourceConfig);
  
  // 更新批量配置
  updateBatchResourceItem(batchConfig, item.name, updates);
}
```

### 3. 批量特有功能

- `batch load-from-collection` - 从合集拉取单品列表（批量特有）
- `batch add-to-collection` - 批量添加到合集（批量特有）

## 需要实现的缺失命令

### 依赖管理（针对批量配置中的单个资源）

1. **batch dep remove** - 移除依赖
2. **batch dep update** - 更新依赖版本
3. **batch dep change** - 修改依赖版本（update的别名）
4. **batch dep sync** - 同步依赖

### 策略管理（针对批量配置中的单个资源）

1. **batch policy add** - 添加策略

## 实现方式

所有缺失的命令都应该：

1. **复用单独资源的服务函数**
   - `dependencyService` - 依赖管理服务
   - `policyService` - 策略管理服务（需要添加 add 功能）

2. **操作流程**：
   ```
   加载批量配置 → 选择/指定资源 → 转换为单独配置 → 调用单独资源服务 → 更新批量配置
   ```

3. **配置文件转换**：
   - 批量配置 → 临时单独配置 → 操作 → 结果 → 更新批量配置

