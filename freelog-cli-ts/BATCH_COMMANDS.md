# 批量资源管理命令说明

本文档详细说明 Freelog CLI 中所有批量资源管理命令的使用方法。

## 目录

- [概述](#概述)
- [基础命令](#基础命令)
- [资源管理命令](#资源管理命令)
- [版本管理命令](#版本管理命令)
- [依赖管理命令](#依赖管理命令)
- [策略管理命令](#策略管理命令)
- [状态管理命令](#状态管理命令)
- [同步命令](#同步命令)
- [配置文件](#配置文件)
- [使用示例](#使用示例)

---

## 概述

批量资源管理命令用于管理合集中的多个单品资源。这些命令操作的是 `freelog.batch-resources.config.js/ts` 配置文件，可以批量或单独管理配置中的资源。

### 核心概念

- **批量配置**：`freelog.batch-resources.config.js/ts` 文件，包含多个资源的配置信息
- **资源项**：批量配置中的单个资源配置
- **默认值**：批量配置中的 `defaults` 字段，用于为所有资源提供默认配置

### 命令格式

所有批量命令都遵循以下格式：

```bash
freelog-cli batch <command> [options]
```

---

## 基础命令

### batch init

初始化批量资源配置文件。

**语法：**
```bash
freelog-cli batch init [directory]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径（默认：`freelog.batch-resources.config.js`）
- `--debug` - 调试模式

**说明：**
- 如果提供了 `directory` 参数，会自动扫描该目录并生成资源列表
- 支持扫描子目录和单个文件（可指定文件扩展名过滤）
- 交互式选择资源类型、版本号等配置

**示例：**
```bash
# 初始化批量配置（交互式）
freelog-cli batch init

# 扫描指定目录初始化
freelog-cli batch init ./chapters

# 指定配置文件路径
freelog-cli batch init -c ./custom-batch-config.js
```

---

### batch add

添加单个资源项到批量配置。

**语法：**
```bash
freelog-cli batch add [filePath]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 支持添加文件或目录
- 如果是目录，会查找 `dist` 子目录或目录中的文件
- 如果是文件，直接使用该文件路径

**示例：**
```bash
# 交互式添加资源
freelog-cli batch add

# 添加指定文件
freelog-cli batch add ./chapter-01.md

# 添加指定目录
freelog-cli batch add ./chapter-01
```

---

### batch list

列出批量配置中的所有资源及其状态。

**语法：**
```bash
freelog-cli batch list
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 显示每个资源的名称、资源ID、版本ID、状态等信息
- 标记已创建、已发布、已跳过的资源

**示例：**
```bash
freelog-cli batch list
```

**输出示例：**
```
资源列表：
✓ resource-01  (已创建, 已发布)
✓ resource-02  (已创建, 已发布)
○ resource-03  (未创建)
⚠ resource-04  (已跳过)
```

---

### batch remove

从批量配置中移除一个或多个资源项。

**语法：**
```bash
freelog-cli batch remove <name...>
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 可以一次移除多个资源
- 只是从配置文件中移除，不会删除服务器上的资源

**示例：**
```bash
# 移除单个资源
freelog-cli batch remove resource-01

# 移除多个资源
freelog-cli batch remove resource-01 resource-02 resource-03
```

---

### batch edit

编辑批量配置中单个资源的所有信息（资源信息和版本信息）。

**语法：**
```bash
freelog-cli batch edit <resourceName>
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 交互式编辑资源的所有字段
- 包括资源名称、标题、介绍、封面图、标签、文件路径、版本号、版本描述等

**示例：**
```bash
freelog-cli batch edit resource-01
```

---

## 资源管理命令

### batch create

批量创建资源。

**语法：**
```bash
freelog-cli batch create [resourceNames]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--force` - 强制创建所有未创建的资源（不需要选择）
- `--select` - 交互式选择要创建的资源
- `--debug` - 调试模式

**说明：**
- 只创建没有 `resourceId` 的资源
- 如果指定了 `resourceNames`，只创建指定的资源
- 如果使用 `--force`，创建所有未创建的资源
- 如果使用 `--select`，交互式选择要创建的资源
- 如果都不指定，会提示选择创建方式

**示例：**
```bash
# 交互式选择创建
freelog-cli batch create --select

# 强制创建所有未创建的资源
freelog-cli batch create --force

# 创建指定的资源
freelog-cli batch create resource-01 resource-02
```

---

### batch update

批量更新资源信息（intro、coverImages、tags、status等）。

**语法：**
```bash
freelog-cli batch update [resourceNames]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 交互式更新资源的资源级信息
- 包括介绍、封面图、标签、状态等
- 如果指定了 `resourceNames`，只更新指定的资源
- 如果不指定，会交互式选择要更新的资源

**示例：**
```bash
# 交互式选择更新
freelog-cli batch update

# 更新指定的资源
freelog-cli batch update resource-01 resource-02
```

---

## 版本管理命令

### batch publish

批量发布资源版本。

**语法：**
```bash
freelog-cli batch publish
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--force` - 强制发布（没有 resourceId 就创建资源后发布）
- `--debug` - 调试模式

**说明：**
- 批量发布所有资源的版本
- 如果资源没有 `resourceId`，会跳过（除非使用 `--force`）
- 使用 `--force` 时，会自动创建未创建的资源，然后发布

**示例：**
```bash
# 批量发布（跳过未创建的资源）
freelog-cli batch publish

# 强制发布（自动创建未创建的资源）
freelog-cli batch publish --force
```

---

### batch publish-one

单独发布某个资源的版本。

**语法：**
```bash
freelog-cli batch publish-one <resourceName>
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 发布指定资源的单个版本
- 如果资源没有 `resourceId`，会先创建资源再发布

**示例：**
```bash
freelog-cli batch publish-one resource-01
```

---

### batch update-version

批量更新版本配置信息（version、description、filePath）。

**语法：**
```bash
freelog-cli batch update-version [resourceNames]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 交互式更新资源的版本级信息
- 包括版本号、版本描述、文件路径等
- 如果指定了 `resourceNames`，只更新指定的资源
- 如果不指定，会交互式选择要更新的资源

**示例：**
```bash
# 交互式选择更新
freelog-cli batch update-version

# 更新指定的资源
freelog-cli batch update-version resource-01 resource-02
```

---

### batch update-and-publish

更新版本信息并发布版本（一次性完成）。

**语法：**
```bash
freelog-cli batch update-and-publish <name>
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--version <version>` - 版本号（格式: x.y.z）
- `--description <text>` - 版本描述
- `--filePath <path>` - 文件路径（相对于当前目录）
- `--debug` - 调试模式

**说明：**
- 先更新版本信息，然后立即发布
- 可以通过命令行选项指定版本信息，也可以交互式输入

**示例：**
```bash
# 交互式更新并发布
freelog-cli batch update-and-publish resource-01

# 指定版本信息并发布
freelog-cli batch update-and-publish resource-01 --version 2.0.0 --description "新版本"
```

---

## 依赖管理命令

### batch dep add

为批量配置中的某个资源添加依赖。

**语法：**
```bash
freelog-cli batch dep add <resourceName> <dependencyId>
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `-v, --version <versionRange>` - 指定依赖版本范围（例如: ^1.0.0）
- `--debug` - 调试模式

**说明：**
- 为指定的资源添加依赖
- 如果指定了版本范围，直接使用；否则会交互式选择或输入

**示例：**
```bash
# 添加依赖（交互式选择版本）
freelog-cli batch dep add resource-01 dep-resource-123

# 添加依赖（指定版本范围）
freelog-cli batch dep add resource-01 dep-resource-123 -v ^1.0.0
```

---

### batch dep list

查看批量配置中某个资源的依赖列表。

**语法：**
```bash
freelog-cli batch dep list [resourceName]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 如果不指定 `resourceName`，会交互式选择资源
- 显示该资源的所有依赖及其版本范围

**示例：**
```bash
# 交互式选择资源
freelog-cli batch dep list

# 查看指定资源的依赖
freelog-cli batch dep list resource-01
```

---

### batch dep remove

为批量配置中的某个资源移除依赖。

**语法：**
```bash
freelog-cli batch dep remove <resourceName> <dependencyId>
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 从指定资源的依赖列表中移除指定的依赖
- 需要确认操作

**示例：**
```bash
freelog-cli batch dep remove resource-01 dep-resource-123
```

---

### batch dep update

为批量配置中的某个资源更新依赖的版本范围。

**语法：**
```bash
freelog-cli batch dep update <resourceName> <dependencyId> [versionRange]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 更新指定依赖的版本范围
- 如果指定了 `versionRange`，直接使用；否则会交互式选择或输入

**示例：**
```bash
# 交互式更新版本范围
freelog-cli batch dep update resource-01 dep-resource-123

# 指定版本范围
freelog-cli batch dep update resource-01 dep-resource-123 ^2.0.0
```

---

### batch dep change

修改依赖版本（update 的别名）。

**语法：**
```bash
freelog-cli batch dep change <resourceName> <dependencyId> [versionRange]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 与 `batch dep update` 功能相同，只是命令别名

**示例：**
```bash
freelog-cli batch dep change resource-01 dep-resource-123 ^2.0.0
```

---

### batch dep sync

为批量配置中的某个资源同步依赖（检查更新、更新到最新版本等）。

**语法：**
```bash
freelog-cli batch dep sync <resourceName> [targetVersion]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- `targetVersion` 可以是 `latest`（更新到最新版本）或不指定（交互式选择）
- 支持三种模式：
  - `check`：仅检查更新，不修改
  - `latest`：更新到最新版本
  - `specific`：交互式选择版本

**示例：**
```bash
# 交互式选择同步模式
freelog-cli batch dep sync resource-01

# 更新到最新版本
freelog-cli batch dep sync resource-01 latest
```

---

## 策略管理命令

### batch policy add

为批量配置中的某个资源添加策略。

**语法：**
```bash
freelog-cli batch policy add <resourceName>
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 交互式添加策略
- 选择策略模板，填写策略参数，编译策略
- 可以选择立即更新到服务器或稍后更新

**示例：**
```bash
freelog-cli batch policy add resource-01
```

---

### batch policy list

查看批量配置中某个资源的策略列表，并可更新状态。

**语法：**
```bash
freelog-cli batch policy list [resourceName]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 如果不指定 `resourceName`，会交互式选择资源
- 显示该资源的所有策略及其状态
- 可以交互式更新策略状态（启用/停用）

**示例：**
```bash
# 交互式选择资源
freelog-cli batch policy list

# 查看指定资源的策略
freelog-cli batch policy list resource-01
```

---

## 状态管理命令

### batch online

批量上架资源。

**语法：**
```bash
freelog-cli batch online [resourceNames]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 将指定资源的状态设置为"上线"（status: 1）
- 如果指定了 `resourceNames`，只上架指定的资源
- 如果不指定，会交互式选择要上架的资源

**示例：**
```bash
# 交互式选择上架
freelog-cli batch online

# 上架指定的资源
freelog-cli batch online resource-01 resource-02
```

---

### batch offline

批量下架资源。

**语法：**
```bash
freelog-cli batch offline [resourceNames]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 将指定资源的状态设置为"下线"（status: 4）
- 如果指定了 `resourceNames`，只下架指定的资源
- 如果不指定，会交互式选择要下架的资源

**示例：**
```bash
# 交互式选择下架
freelog-cli batch offline

# 下架指定的资源
freelog-cli batch offline resource-01 resource-02
```

---

## 同步命令

### batch sync

从服务器同步资源信息到批量配置。

**语法：**
```bash
freelog-cli batch sync [resourceNames]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--mode <mode>` - 同步模式：`cover`（覆盖）或 `append`（追加），默认：`cover`
- `--debug` - 调试模式

**说明：**
- `cover`：覆盖模式，用服务器数据完全覆盖本地配置
- `append`：追加模式，只更新服务器有值的字段
- 如果指定了 `resourceNames`，只同步指定的资源
- 如果不指定，会交互式选择要同步的资源

**示例：**
```bash
# 交互式选择同步（覆盖模式）
freelog-cli batch sync

# 同步指定的资源（追加模式）
freelog-cli batch sync resource-01 resource-02 --mode append
```

---

### batch sync-version

从服务器同步版本信息到批量配置。

**语法：**
```bash
freelog-cli batch sync-version [resourceNames]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `-v, --version <version>` - 指定版本号或 `latest`（不传则使用配置文件版本或最新版本）
- `--mode <mode>` - 同步模式：`cover`（覆盖）或 `append`（追加），默认：`cover`
- `--debug` - 调试模式

**说明：**
- 同步指定版本的版本信息
- `cover`：覆盖模式，用服务器数据完全覆盖本地配置
- `append`：追加模式，只更新服务器有值的字段
- 如果指定了 `resourceNames`，只同步指定的资源
- 如果不指定，会交互式选择要同步的资源

**示例：**
```bash
# 交互式选择同步（最新版本）
freelog-cli batch sync-version

# 同步指定版本
freelog-cli batch sync-version resource-01 -v 1.0.0

# 同步最新版本（追加模式）
freelog-cli batch sync-version resource-01 -v latest --mode append
```

---

### batch load-from-collection

从合集中拉取单品列表并填充到批量配置。

**语法：**
```bash
freelog-cli batch load-from-collection [collectionConfig]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--collection-id <id>` - 指定合集ID（如果不使用配置文件）
- `--mode <mode>` - 同步模式：`cover`（覆盖）或 `append`（追加），默认：`append`
- `--debug` - 调试模式

**说明：**
- 从指定的合集中拉取所有单品资源
- 批量获取这些资源的资源信息和版本信息
- 填充到批量配置文件中
- `cover`：覆盖模式，完全替换现有配置
- `append`：追加模式，只更新服务器有值的字段

**示例：**
```bash
# 使用合集配置文件
freelog-cli batch load-from-collection

# 指定合集ID
freelog-cli batch load-from-collection --collection-id collection-123

# 覆盖模式
freelog-cli batch load-from-collection --mode cover
```

---

### batch add-to-collection

批量将资源添加到合集。

**语法：**
```bash
freelog-cli batch add-to-collection [collectionConfig]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 将批量配置中的所有资源添加到指定的合集
- 如果资源没有 `resourceId`，会跳过
- 如果资源已经在合集中，会跳过

**示例：**
```bash
# 使用合集配置文件
freelog-cli batch add-to-collection

# 指定合集配置文件路径
freelog-cli batch add-to-collection ./freelog.collection.config.js
```

---

## 配置文件

### 批量资源配置文件结构

批量资源配置文件 `freelog.batch-resources.config.js/ts` 的结构如下：

```javascript
const config = {
  defaults: {
    resourceType: [],           // 默认资源类型
    resourceTypeCode: '',       // 默认资源类型代码
    version: '1.0.0',           // 默认版本号
    description: '',             // 默认版本描述
    intro: '',                  // 默认资源介绍
    coverImages: [],            // 默认封面图
    tags: [],                   // 默认标签
    filePath: './dist',         // 默认文件路径
  },
  resources: [
    {
      name: 'resource-01',      // 资源名称（唯一标识）
      resourceName: 'resource-01', // 资源名称（用于创建）
      resourceTitle: '',         // 资源标题
      intro: '',                // 资源介绍
      coverImages: [],          // 封面图
      tags: [],                 // 标签
      filePath: './resource-01/dist', // 文件路径
      resourceId: '',           // 资源ID（创建后填充）
      version: '1.0.0',         // 版本号
      description: '',           // 版本描述
      resourceType: [],          // 资源类型
      resourceTypeCode: '',      // 资源类型代码
      versionId: '',            // 版本ID（发布后填充）
      fileSha1: '',             // 文件SHA1（发布后填充）
      skip: false,              // 是否跳过
    },
    // ... 更多资源
  ],
};

module.exports = config;
```

### 字段说明

#### defaults（默认值）

- `resourceType`: 默认资源类型数组
- `resourceTypeCode`: 默认资源类型代码
- `version`: 默认版本号
- `description`: 默认版本描述
- `intro`: 默认资源介绍
- `coverImages`: 默认封面图数组
- `tags`: 默认标签数组
- `filePath`: 默认文件路径

#### resources（资源列表）

每个资源项包含：

- `name`: 资源名称（唯一标识，用于命令中指定资源）
- `resourceName`: 资源名称（用于创建资源）
- `resourceTitle`: 资源标题
- `intro`: 资源介绍
- `coverImages`: 封面图URL数组
- `tags`: 标签数组
- `filePath`: 文件路径（相对于项目根目录）
- `resourceId`: 资源ID（创建资源后自动填充）
- `version`: 版本号
- `description`: 版本描述
- `resourceType`: 资源类型数组
- `resourceTypeCode`: 资源类型代码
- `versionId`: 版本ID（发布版本后自动填充）
- `fileSha1`: 文件SHA1值（发布版本后自动填充）
- `skip`: 是否跳过该资源（true/false）

---

## 使用示例

### 完整工作流程示例

```bash
# 1. 初始化批量配置
freelog-cli batch init ./chapters

# 2. 查看资源列表
freelog-cli batch list

# 3. 批量创建资源
freelog-cli batch create --force

# 4. 批量发布版本
freelog-cli batch publish

# 5. 为某个资源添加依赖
freelog-cli batch dep add resource-01 dep-resource-123 -v ^1.0.0

# 6. 为某个资源添加策略
freelog-cli batch policy add resource-01

# 7. 批量上架资源
freelog-cli batch online

# 8. 批量添加到合集
freelog-cli batch add-to-collection

# 9. 从合集同步资源信息
freelog-cli batch load-from-collection
```

### 单独资源操作示例

```bash
# 编辑单个资源
freelog-cli batch edit resource-01

# 更新单个资源的版本信息
freelog-cli batch update-version resource-01

# 更新并发布单个资源
freelog-cli batch update-and-publish resource-01 --version 2.0.0

# 发布单个资源
freelog-cli batch publish-one resource-01

# 同步单个资源信息
freelog-cli batch sync resource-01 --mode append

# 同步单个资源的版本信息
freelog-cli batch sync-version resource-01 -v latest

# 上架单个资源
freelog-cli batch online resource-01

# 下架单个资源
freelog-cli batch offline resource-01
```

### 依赖管理示例

```bash
# 查看依赖列表
freelog-cli batch dep list resource-01

# 添加依赖
freelog-cli batch dep add resource-01 dep-resource-123 -v ^1.0.0

# 更新依赖版本
freelog-cli batch dep update resource-01 dep-resource-123 ^2.0.0

# 同步依赖（更新到最新版本）
freelog-cli batch dep sync resource-01 latest

# 移除依赖
freelog-cli batch dep remove resource-01 dep-resource-123
```

### 策略管理示例

```bash
# 添加策略
freelog-cli batch policy add resource-01

# 查看策略列表
freelog-cli batch policy list resource-01
```

---

## 注意事项

1. **配置文件路径**：默认使用 `freelog.batch-resources.config.js`，可以通过 `-c` 选项指定其他路径

2. **资源名称**：`name` 字段是资源的唯一标识，在命令中用于指定资源

3. **资源ID**：创建资源后会自动填充 `resourceId`，发布版本后会填充 `versionId` 和 `fileSha1`

4. **默认值**：`defaults` 中的值会应用到所有资源，但资源项中的值会覆盖默认值

5. **跳过资源**：设置 `skip: true` 的资源会被大多数命令跳过

6. **同步模式**：
   - `cover`：完全覆盖本地配置
   - `append`：只更新服务器有值的字段

7. **交互式操作**：大多数命令支持交互式选择资源，使用空格键进行多选，回车确认

8. **临时文件**：依赖和策略管理命令会创建临时配置文件，操作完成后自动清理

---

## 相关文档

- [合集使用指南](./docs/COLLECTION_GUIDE.md) - 合集和批量管理的完整指南
- [批量业务逻辑](./docs/BATCH_BUSINESS_LOGIC.md) - 批量管理的业务逻辑说明
- [批量管理场景](./docs/BATCH_MANAGEMENT_SCENARIOS.md) - 各种批量管理场景示例

---

**最后更新：** 2025-01-15

