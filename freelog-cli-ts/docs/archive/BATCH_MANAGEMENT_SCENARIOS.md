# 批量管理功能使用场景

本文档介绍批量资源管理的完整使用场景和命令。

## 功能概览

批量管理功能支持以下场景：

### 1. 初始化和管理
- ✅ `batch init` - 初始化批量配置
- ✅ `batch add` - 添加单个资源
- ✅ `batch list` - 查看资源列表和状态
- ✅ `batch remove` - 移除资源项

### 2. 资源创建和发布
- ✅ `batch create` - 批量创建资源
- ✅ `batch publish` - 批量发布版本
- ✅ `batch publish-one` - 单独发布某个资源

### 3. 信息更新
- ✅ `batch update` - 批量更新资源信息（intro、coverImages、tags、status）
- ✅ `batch update-version` - 批量更新版本信息（version、description、filePath）
- ✅ `batch update-and-publish` - 更新版本信息并发布（一次性完成）

### 4. 信息同步
- ✅ `batch sync` - 从服务器同步资源信息
- ✅ `batch sync-version` - 从服务器同步版本信息

### 5. 合集管理
- ✅ `batch add-to-collection` - 批量添加到合集

---

## 使用场景详解

### 场景一：一次性批量发布（已有功能）

**适用场景**：初始化后，一次性创建所有资源并发布。

```bash
# 1. 初始化批量配置
freelog-cli batch init

# 2. 批量创建资源
freelog-cli batch create

# 3. 批量发布版本
freelog-cli batch publish
```

---

### 场景二：逐个新增资源

**适用场景**：已有批量配置，需要逐个添加新资源。

```bash
# 1. 添加单个资源（文件或目录）
freelog-cli batch add ./new-resource.md
# 或
freelog-cli batch add ./new-resource-folder

# 2. 查看资源列表
freelog-cli batch list

# 3. 创建新添加的资源
freelog-cli batch create

# 4. 发布新资源
freelog-cli batch publish
```

---

### 场景三：更新资源信息

**适用场景**：需要批量更新资源的介绍、封面图、标签或状态。

```bash
# 1. 查看当前资源列表
freelog-cli batch list

# 2. 批量更新资源信息（交互式选择资源和字段）
freelog-cli batch update

# 3. 更新指定资源
freelog-cli batch update resource-01,resource-02

# 4. 可更新的字段：
#    - intro（资源介绍）
#    - coverImages（封面图）
#    - tags（标签）
#    - status（资源状态：上架/下架）
```

**示例**：
```bash
# 更新所有资源的标签
freelog-cli batch update
# 选择要更新的资源
# 选择字段：tags
# 输入标签：小说,章节,连载
```

---

### 场景四：更新版本信息

**适用场景**：需要批量更新版本号、版本描述或文件路径。

```bash
# 1. 批量更新版本信息（交互式选择资源和字段）
freelog-cli batch update-version

# 2. 更新指定资源
freelog-cli batch update-version resource-01,resource-02

# 3. 可更新的字段：
#    - version（版本号）
#    - description（版本描述）
#    - filePath（文件路径）
```

**示例**：
```bash
# 更新所有资源的版本号
freelog-cli batch update-version
# 选择要更新的资源
# 选择字段：version
# 输入版本号：1.1.0
# 选择：统一应用到所有资源
```

---

### 场景五：更新版本信息并发布

**适用场景**：更新版本信息后立即发布，一次性完成。

```bash
# 1. 更新版本信息并发布（交互式）
freelog-cli batch update-and-publish

# 2. 更新指定资源并发布
freelog-cli batch update-and-publish resource-01,resource-02

# 3. 流程：
#    - 选择要更新的资源
#    - 选择要更新的字段（version、description、filePath）
#    - 输入更新值
#    - 自动发布
```

**示例**：
```bash
# 更新版本号并发布
freelog-cli batch update-and-publish
# 选择资源：resource-01
# 选择字段：version
# 输入版本号：1.1.0
# 自动发布
```

---

### 场景六：单独发布某个资源

**适用场景**：只发布某个特定资源，不影响其他资源。

```bash
# 单独发布某个资源
freelog-cli batch publish-one resource-01
```

**使用场景**：
- 某个资源有更新，需要单独发布
- 测试某个资源的发布流程
- 修复某个资源的发布问题

---

### 场景七：同步服务器信息

**适用场景**：从服务器同步最新的资源信息和版本信息到本地配置。

```bash
# 1. 同步资源信息（intro、coverImages、tags等）
freelog-cli batch sync

# 2. 同步指定资源
freelog-cli batch sync resource-01,resource-02

# 3. 同步版本信息
freelog-cli batch sync-version

# 4. 同步指定资源的版本信息
freelog-cli batch sync-version resource-01,resource-02
# 输入版本号（留空使用 latest）
```

**使用场景**：
- 在其他地方修改了资源信息，需要同步到本地配置
- 需要查看服务器上的最新版本信息
- 配置丢失，需要从服务器恢复

---

### 场景八：管理资源列表

**适用场景**：查看资源状态、移除不需要的资源。

```bash
# 1. 查看资源列表和状态
freelog-cli batch list

# 显示信息：
#   - 资源名称、资源ID、版本ID
#   - 文件路径
#   - 状态（已发布/未发布/未创建/跳过）
#   - 统计信息

# 2. 移除资源项（从配置中移除，不会删除服务器上的资源）
freelog-cli batch remove

# 3. 移除指定资源
freelog-cli batch remove resource-01,resource-02
```

---

## 完整工作流程示例

### 示例一：小说章节批量管理

```bash
# 1. 初始化批量配置（扫描章节文件夹）
freelog-cli batch init
# 选择：扫描文件夹
# 输入路径：./chapters
# 选择：扫描单个文件
# 文件扩展名：.md

# 2. 查看资源列表
freelog-cli batch list

# 3. 批量创建资源
freelog-cli batch create

# 4. 批量发布版本
freelog-cli batch publish

# 5. 添加到合集
freelog-cli batch add-to-collection
```

### 示例二：更新部分章节

```bash
# 1. 添加新章节
freelog-cli batch add ./chapters/chapter-21.md

# 2. 创建新章节资源
freelog-cli batch create

# 3. 单独发布新章节
freelog-cli batch publish-one chapter-21

# 4. 更新已发布章节的版本信息并重新发布
freelog-cli batch update-and-publish chapter-01,chapter-02
```

### 示例三：批量更新资源信息

```bash
# 1. 批量更新所有资源的标签
freelog-cli batch update
# 选择所有资源
# 选择字段：tags
# 输入标签：小说,章节,更新

# 2. 批量更新版本号
freelog-cli batch update-version
# 选择所有资源
# 选择字段：version
# 输入版本号：1.2.0
# 统一应用到所有资源

# 3. 批量发布新版本
freelog-cli batch publish
```

---

## 命令参数说明

### 资源名称参数

大部分命令支持 `[resourceNames]` 参数，可以指定一个或多个资源名称：

```bash
# 单个资源
freelog-cli batch update resource-01

# 多个资源（用逗号分隔）
freelog-cli batch update resource-01,resource-02,resource-03
```

如果不提供参数，命令会交互式选择资源。

### 配置文件选项

所有批量命令都支持 `-c, --config <path>` 选项：

```bash
# 使用自定义配置文件
freelog-cli batch list -c ./custom-batch-config.js
```

---

## 最佳实践

1. **定期查看资源状态**：使用 `batch list` 查看资源状态，了解哪些资源需要更新或发布。

2. **批量操作前先同步**：在批量更新前，先使用 `batch sync` 和 `batch sync-version` 同步服务器信息。

3. **单独测试**：新增资源后，先使用 `batch publish-one` 单独测试发布流程。

4. **版本管理**：使用 `batch update-version` 统一管理版本号，保持版本一致性。

5. **配置备份**：批量操作前，备份 `freelog.batch-resources.config.js` 文件。

---

## 常见问题

### Q: 如何只更新某个资源的版本号？

A: 使用 `batch update-version resource-name`，然后只选择 `version` 字段。

### Q: 如何批量更新所有资源的版本号？

A: 使用 `batch update-version`，不指定资源名称，选择所有资源，然后选择统一应用到所有资源。

### Q: 更新版本信息后需要重新发布吗？

A: 是的。更新版本信息只是更新了配置，需要使用 `batch publish` 或 `batch publish-one` 发布。或者使用 `batch update-and-publish` 一次性完成。

### Q: 如何查看某个资源的状态？

A: 使用 `batch list` 查看所有资源的状态。

### Q: 移除资源项会删除服务器上的资源吗？

A: 不会。`batch remove` 只是从配置文件中移除资源项，不会删除服务器上的资源。

---

## 命令速查表

| 命令 | 功能 | 参数 |
|------|------|------|
| `batch init` | 初始化批量配置 | `[directory]` |
| `batch add` | 添加单个资源 | `[filePath]` |
| `batch list` | 列出所有资源 | - |
| `batch create` | 批量创建资源 | - |
| `batch publish` | 批量发布版本 | - |
| `batch publish-one` | 单独发布资源 | `<resourceName>` |
| `batch update` | 更新资源信息 | `[resourceNames]` |
| `batch update-version` | 更新版本信息 | `[resourceNames]` |
| `batch update-and-publish` | 更新并发布 | `[resourceNames]` |
| `batch sync` | 同步资源信息 | `[resourceNames]` |
| `batch sync-version` | 同步版本信息 | `[resourceNames]` |
| `batch remove` | 移除资源项 | `[resourceNames]` |
| `batch add-to-collection` | 添加到合集 | `[collectionConfig]` |

