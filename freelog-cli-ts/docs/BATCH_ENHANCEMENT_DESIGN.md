# 批量管理功能增强设计

## 需求分析

### 1. 资源信息编辑
- ✅ 已有 `batch add` - 添加资源
- ✅ 已有 `batch update` - 更新资源信息
- ✅ 已有 `batch update-version` - 更新版本信息
- ⚠️ 需要增强：支持更灵活的编辑单个资源的所有字段

### 2. 批量创建增强
- ✅ 已有 `batch create` - 只创建没有 resourceId 的
- ✅ 已实现：`--force` - 强制创建所有未创建的资源（不需要选择）
- ✅ 已实现：`--select` - 交互式选择要创建的资源
- ✅ 已实现：`[resourceNames]` - 指定资源名称创建

### 3. 批量发布增强
- ✅ 已有 `batch publish` - 只发布有 resourceId 但没有 versionId 的
- ❌ 需要：支持强制发布（没有 resourceId 就创建资源后发布）

### 4. 从合集拉取单品
- ❌ 需要：`batch load-from-collection` - 从合集中拉取单品列表
- ❌ 需要：支持覆盖/追加模式

### 5. 批量同步增强
- ✅ 已有 `batch sync` - 同步资源信息
- ✅ 已有 `batch sync-version` - 同步版本信息
- ❌ 需要：支持覆盖/追加模式

### 6. 批量配置中的资源依赖管理（针对单个资源）
- ✅ 已实现：`batch dep add <resourceName> <dependencyId>` - 为批量配置中的某个资源添加依赖
- ⚠️ 待实现：`batch dep remove <resourceName> <dependencyId>` - 移除依赖
- ✅ 已实现：`batch dep list [resourceName]` - 查看批量配置中某个资源的依赖列表

### 7. 批量配置中的资源策略管理（针对单个资源）
- ⚠️ 待实现：`batch policy add <resourceName>` - 为批量配置中的某个资源添加策略
- ✅ 已实现：`batch policy list [resourceName]` - 查看批量配置中某个资源的策略列表（支持更新策略状态）

### 8. 批量上下线
- ❌ 需要：`batch online` - 批量上架
- ❌ 需要：`batch offline` - 批量下架

---

## 实现计划

### Phase 1: 增强现有命令
1. `batch create` - 添加 `--force` 和 `--select` 选项
2. `batch publish` - 添加 `--force` 选项
3. `batch sync` - 添加 `--mode` 选项（cover/append）
4. `batch sync-version` - 添加 `--mode` 选项（cover/append）

### Phase 2: 新增命令
1. `batch load-from-collection` - 从合集拉取单品
2. `batch edit` - 编辑单个资源的所有信息
3. `batch dep` - 批量依赖管理子命令组
4. `batch policy` - 批量策略管理子命令组
5. `batch online/offline` - 批量上下线

---

## 详细设计

### 1. batch create 增强

```bash
# 默认：交互式选择要创建的资源（只显示未创建的资源）
freelog-cli batch create

# 强制创建：直接创建所有未创建的资源（不需要选择）
freelog-cli batch create --force

# 选择模式：交互式选择要创建的资源
freelog-cli batch create --select

# 指定资源名称创建
freelog-cli batch create resource-01,resource-02
```

### 2. batch publish 增强

```bash
# 当前：只发布有 resourceId 但没有 versionId 的
freelog-cli batch publish

# 增强：强制发布（没有 resourceId 就创建资源后发布）
freelog-cli batch publish --force
```

### 3. batch load-from-collection

```bash
# 从合集中拉取单品列表
freelog-cli batch load-from-collection [collectionConfig]

# 选项：
# --mode cover|append - 覆盖或追加（默认：append）
# --collection-id <id> - 指定合集ID
```

### 4. batch sync 增强

```bash
# 当前：同步资源信息（覆盖模式）
freelog-cli batch sync

# 增强：支持覆盖/追加模式
freelog-cli batch sync --mode cover  # 覆盖现有配置
freelog-cli batch sync --mode append # 追加新字段，保留现有字段
```

### 5. batch dep 子命令组（针对批量配置中的单个资源）

```bash
# 为批量配置中的某个资源添加依赖
freelog-cli batch dep add <resourceName> <dependencyId>

# 移除依赖（待实现）
freelog-cli batch dep remove <resourceName> <dependencyId>

# 查看批量配置中某个资源的依赖列表
freelog-cli batch dep list [resourceName]
```

### 6. batch policy 子命令组（针对批量配置中的单个资源）

```bash
# 为批量配置中的某个资源添加策略（待实现）
freelog-cli batch policy add <resourceName>

# 查看批量配置中某个资源的策略列表
freelog-cli batch policy list [resourceName]

# 支持在 list 命令中更新策略状态
```

### 7. batch online/offline

```bash
# 批量上架
freelog-cli batch online [resourceNames]

# 批量下架
freelog-cli batch offline [resourceNames]
```

---

## 数据结构扩展

### BatchResourceItemConfig 扩展

```typescript
export interface BatchResourceItemConfig {
  // ... 现有字段
  
  // 新增：依赖列表（每个资源可以有独立的依赖）
  dependencies?: Dependency[];
  
  // 新增：策略列表（每个资源可以有独立的策略）
  policies?: PolicyInfo[];
  
  // 新增：资源状态（用于上下线）
  status?: number;
}
```

---

## 实现优先级

1. **高优先级**：
   - batch create 增强（--force, --select）
   - batch publish 增强（--force）
   - batch load-from-collection

2. **中优先级**：
   - batch sync 增强（--mode）
   - batch edit（编辑单个资源）

3. **低优先级**：
   - batch dep 子命令组
   - batch policy 子命令组
   - batch online/offline

