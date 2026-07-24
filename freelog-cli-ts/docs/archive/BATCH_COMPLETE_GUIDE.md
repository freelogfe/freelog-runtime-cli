# 批量管理完整功能指南

## 功能概览

批量管理功能现已支持完整的资源生命周期管理，包括：

### ✅ 已实现功能

1. **初始化和管理**
   - `batch init` - 初始化批量配置
   - `batch add` - 添加单个资源
   - `batch list` - 查看资源列表和状态
   - `batch remove` - 移除资源项
   - `batch edit` - 编辑单个资源的所有信息

2. **资源创建和发布（增强）**
   - `batch create` - 批量创建资源
     - `--force` - 强制创建所有资源（即使已有 resourceId）
     - `--select` - 交互式选择要创建的资源
     - `[resourceNames]` - 指定资源名称创建
   - `batch publish` - 批量发布版本
     - `--force` - 强制发布（没有 resourceId 就创建资源后发布）
   - `batch publish-one` - 单独发布某个资源
   - `batch update-and-publish` - 更新版本信息并发布

3. **信息更新**
   - `batch update` - 批量更新资源信息（intro、coverImages、tags、status）
   - `batch update-version` - 批量更新版本信息（version、description、filePath）

4. **信息同步（增强）**
   - `batch sync` - 从服务器同步资源信息
     - `--mode cover|append` - 覆盖或追加模式
   - `batch sync-version` - 从服务器同步版本信息
     - `--mode cover|append` - 覆盖或追加模式

5. **从合集拉取**
   - `batch load-from-collection` - 从合集中拉取单品列表
     - `--mode cover|append` - 覆盖或追加模式
     - `--collection-id <id>` - 指定合集ID

6. **批量依赖管理**
   - `batch dep add` - 批量添加依赖
   - `batch dep list` - 批量查看依赖列表

7. **批量策略管理**
   - `batch policy list` - 批量查看策略列表（支持批量更新策略状态）

8. **批量上下线**
   - `batch online` - 批量上架资源
   - `batch offline` - 批量下架资源

---

## 详细使用说明

### 1. 初始化批量配置

```bash
# 初始化批量配置（可扫描文件夹）
freelog-cli batch init

# 扫描指定目录
freelog-cli batch init ./chapters

# 扫描时包含单个文件
freelog-cli batch init ./chapters --include-files --file-extensions .md,.txt
```

### 2. 添加资源

```bash
# 添加单个资源（文件或目录）
freelog-cli batch add ./new-resource.md

# 交互式添加
freelog-cli batch add
```

### 3. 编辑资源信息

```bash
# 编辑单个资源的所有信息
freelog-cli batch edit resource-01

# 可以编辑：
# - 资源基本信息（名称、标题、介绍、封面图、标签）
# - 版本信息（版本号、描述、文件路径）
```

### 4. 批量创建资源（增强）

```bash
# 默认：只创建没有 resourceId 的资源
freelog-cli batch create

# 强制创建所有资源（即使已有 resourceId）
freelog-cli batch create --force

# 交互式选择要创建的资源
freelog-cli batch create --select

# 创建指定资源
freelog-cli batch create resource-01,resource-02
```

### 5. 批量发布版本（增强）

```bash
# 默认：只发布有 resourceId 但没有 versionId 的资源
freelog-cli batch publish

# 强制发布（没有 resourceId 就创建资源后发布）
freelog-cli batch publish --force
```

### 6. 从合集拉取单品

```bash
# 从合集配置拉取单品列表
freelog-cli batch load-from-collection

# 指定合集配置文件
freelog-cli batch load-from-collection ./freelog.collection.config.js

# 直接指定合集ID
freelog-cli batch load-from-collection --collection-id <collectionId>

# 覆盖模式（清空现有资源，只保留从合集拉取的）
freelog-cli batch load-from-collection --mode cover

# 追加模式（保留现有资源，添加新资源）
freelog-cli batch load-from-collection --mode append
```

### 7. 批量同步（增强）

```bash
# 同步资源信息（覆盖模式）
freelog-cli batch sync --mode cover

# 同步资源信息（追加模式，只更新服务器有值的字段）
freelog-cli batch sync --mode append

# 同步指定资源
freelog-cli batch sync resource-01,resource-02

# 同步版本信息
freelog-cli batch sync-version --mode cover
```

### 8. 批量依赖管理

```bash
# 批量添加依赖
freelog-cli batch dep add <dependencyId> [resourceNames]

# 批量查看依赖列表
freelog-cli batch dep list [resourceNames]
```

### 9. 批量策略管理

```bash
# 批量查看策略列表
freelog-cli batch policy list [resourceNames]

# 支持批量更新策略状态（启用/停用）
```

### 10. 批量上下线

```bash
# 批量上架资源
freelog-cli batch online [resourceNames]

# 批量下架资源
freelog-cli batch offline [resourceNames]
```

---

## 完整工作流程示例

### 场景一：从合集拉取并批量发布

```bash
# 1. 从合集拉取单品列表
freelog-cli batch load-from-collection --mode append

# 2. 查看资源列表
freelog-cli batch list

# 3. 编辑资源信息（如需要）
freelog-cli batch edit resource-01

# 4. 更新文件路径等信息
freelog-cli batch update-version

# 5. 强制发布（自动创建资源并发布）
freelog-cli batch publish --force
```

### 场景二：逐个新增并管理

```bash
# 1. 添加新资源
freelog-cli batch add ./new-chapter.md

# 2. 编辑资源信息
freelog-cli batch edit new-chapter

# 3. 创建资源
freelog-cli batch create --select

# 4. 添加依赖
freelog-cli batch dep add <dependencyId> new-chapter

# 5. 发布版本
freelog-cli batch publish-one new-chapter

# 6. 上架资源
freelog-cli batch online new-chapter
```

### 场景三：批量更新和同步

```bash
# 1. 从服务器同步最新信息（追加模式，保留本地修改）
freelog-cli batch sync --mode append

# 2. 批量更新资源信息
freelog-cli batch update

# 3. 批量更新版本号
freelog-cli batch update-version

# 4. 批量发布新版本
freelog-cli batch publish
```

---

## 命令参数说明

### 通用参数

- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

### batch create 参数

- `--force` - 强制创建所有资源（即使已有 resourceId）
- `--select` - 交互式选择要创建的资源
- `[resourceNames]` - 指定资源名称（多个用逗号分隔）

### batch publish 参数

- `--force` - 强制发布（没有 resourceId 就创建资源后发布）

### batch sync 参数

- `--mode cover|append` - 同步模式
  - `cover` - 覆盖模式（完全替换现有配置）
  - `append` - 追加模式（只更新服务器有值的字段）

### batch load-from-collection 参数

- `--collection-id <id>` - 指定合集ID（如果不使用配置文件）
- `--mode cover|append` - 同步模式（默认：append）

---

## 注意事项

1. **强制创建**：`batch create --force` 会重新创建已有 resourceId 的资源，会创建新资源，不会覆盖现有资源。

2. **强制发布**：`batch publish --force` 会自动创建没有 resourceId 的资源，然后发布。

3. **同步模式**：
   - `cover` 模式：完全替换现有配置
   - `append` 模式：只更新服务器有值的字段，保留本地配置的其他字段

4. **批量依赖添加**：由于依赖添加涉及签约和支付流程，批量依赖添加功能需要为每个资源单独处理，建议使用单个资源的依赖添加命令。

5. **配置文件**：批量配置文件为 `freelog.batch-resources.config.js/ts`，建议纳入版本控制。

---

## 功能对比表

| 功能 | 单个资源 | 批量管理 | 说明 |
|------|---------|---------|------|
| 创建资源 | `create` | `batch create` | ✅ 支持强制创建和选择 |
| 发布版本 | `publish` | `batch publish` | ✅ 支持强制发布 |
| 更新资源信息 | `update` | `batch update` | ✅ |
| 更新版本信息 | `updateVersion` | `batch update-version` | ✅ |
| 同步资源信息 | `syncr` | `batch sync` | ✅ 支持覆盖/追加模式 |
| 同步版本信息 | `syncv` | `batch sync-version` | ✅ 支持覆盖/追加模式 |
| 添加依赖 | `dep add` | `batch dep add` | ⚠️ 需要单独处理 |
| 查看依赖 | `dep list` | `batch dep list` | ✅ |
| 添加策略 | `policy add` | - | 建议使用单个资源命令 |
| 查看策略 | `policy list` | `batch policy list` | ✅ |
| 上架资源 | `online` | `batch online` | ✅ |
| 下架资源 | `offline` | `batch offline` | ✅ |
| 从合集拉取 | - | `batch load-from-collection` | ✅ 新增功能 |

---

## 最佳实践

1. **初始化后先拉取**：如果已有合集，先使用 `batch load-from-collection` 拉取单品列表。

2. **使用追加模式同步**：使用 `--mode append` 同步时，可以保留本地修改的字段。

3. **逐个测试**：新增资源后，先使用 `batch publish-one` 单独测试发布流程。

4. **定期同步**：定期使用 `batch sync` 和 `batch sync-version` 同步服务器信息。

5. **配置备份**：批量操作前，备份 `freelog.batch-resources.config.js` 文件。

