# 合集使用指南

本文档详细介绍如何使用 Freelog CLI 创建和管理合集资源，以及如何批量管理合集的单品资源。

## 目录

- [合集使用指南](#合集使用指南)
  - [目录](#目录)
  - [什么是合集？](#什么是合集)
  - [快速开始](#快速开始)
  - [初始化合集](#初始化合集)
    - [方式一：使用 init 命令（推荐）](#方式一使用-init-命令推荐)
    - [方式二：使用 collection init 命令](#方式二使用-collection-init-命令)
  - [批量管理单品资源](#批量管理单品资源)
    - [初始化批量配置](#初始化批量配置)
    - [添加单个资源到批量配置](#添加单个资源到批量配置)
    - [扫描文件夹自动生成配置](#扫描文件夹自动生成配置)
  - [完整工作流程](#完整工作流程)
    - [场景一：小说合集（文件夹结构）](#场景一小说合集文件夹结构)
    - [场景二：小说合集（单个文件）](#场景二小说合集单个文件)
    - [场景三：混合场景](#场景三混合场景)
  - [命令详解](#命令详解)
    - [合集命令](#合集命令)
    - [批量管理命令](#批量管理命令)
  - [配置文件说明](#配置文件说明)
    - [合集配置文件](#合集配置文件)
    - [批量资源配置文件](#批量资源配置文件)
  - [常见问题](#常见问题)
  - [最佳实践](#最佳实践)

---

## 什么是合集？

合集（Collection）是 Freelog 平台的一种特殊资源类型，用于将多个独立的资源组织在一起。例如：

- **小说合集**：包含多个章节（每个章节是一个独立的资源）
- **图片集**：包含多张图片（每张图片是一个独立的资源）
- **音频专辑**：包含多个音频文件（每个音频是一个独立的资源）

### 合集的特点

1. **合集本身是一个资源**：需要创建合集资源，配置策略等
2. **单品是已创建的资源**：合集中的每个单品必须是已经创建好的资源
3. **批量管理**：当单品数量较多时，可以使用批量管理功能简化操作

---

## 快速开始

### 最简单的流程

```bash
# 1. 初始化合集（包含批量管理配置）
freelog-cli init
# 选择：合集（含批量管理单品资源）

# 2. 创建合集资源
freelog-cli collection create

# 3. 批量创建单品资源
freelog-cli batch create

# 4. 批量发布单品版本
freelog-cli batch publish

# 5. 批量添加到合集
freelog-cli batch add-to-collection

# 6. 发布合集
freelog-cli collection publish
```

---

## 初始化合集

### 方式一：使用 init 命令（推荐）

这是最简单的方式，一次性初始化合集配置和批量管理配置。

```bash
freelog-cli init
```

**交互流程：**

1. 选择初始化类型：选择 `合集（含批量管理单品资源）`
2. 选择合集资源类型：从列表中选择合集的资源类型（如"小说合集"）
3. 输入合集名称：如 `my-novel-collection`
4. 是否初始化批量资源配置：选择 `是`
5. 是否扫描文件夹：选择 `是` 或 `否`
   - 如果选择 `是`：
     - 输入文件夹路径：如 `./chapters`
     - 是否扫描单个文件：选择 `是` 或 `否`
     - 如果选择扫描文件，输入文件扩展名：如 `.md`
6. 选择单品资源类型：选择单品的资源类型（如"文本"）
7. 输入默认版本号：如 `1.0.0`
8. 输入默认版本描述：可选

**生成的文件：**

- `freelog.collection.config.js` - 合集配置文件
- `freelog.batch-resources.config.js` - 批量资源配置文件

### 方式二：使用 collection init 命令

如果只需要初始化合集配置，不使用批量管理功能：

```bash
freelog-cli collection init
```

**交互流程：**

1. 选择合集资源类型
2. 输入合集名称

**生成的文件：**

- `freelog.collection.config.js` - 合集配置文件

---

## 批量管理单品资源

### 初始化批量配置

如果已经初始化了合集，但没有批量配置，可以单独初始化：

```bash
freelog-cli batch init
```

**交互流程：**

1. 是否扫描文件夹：选择 `是` 或 `否`
2. 如果选择扫描：
   - 输入文件夹路径
   - 是否扫描单个文件
   - 如果扫描文件，输入文件扩展名
3. 选择资源类型
4. 输入默认版本号等信息

### 添加单个资源到批量配置

#### 方法一：使用 batch add 命令（推荐）

```bash
# 交互式添加
freelog-cli batch add

# 或直接指定文件路径
freelog-cli batch add a.md
```

**交互流程：**

1. 输入文件或目录路径（如果未在命令行指定）
2. 输入资源名称：如 `chapter-01`
3. 输入资源标题：如 `第一章 开始`
4. 输入资源介绍：可选

**示例：**

```bash
# 添加单个文件
freelog-cli batch add ./chapters/chapter-01.md

# 添加目录（会自动查找 dist 子目录）
freelog-cli batch add ./chapters/chapter-01
```

#### 方法二：手动编辑配置文件

直接编辑 `freelog.batch-resources.config.js` 文件：

```javascript
resources: [
  {
    name: 'chapter-01',
    resourceName: 'chapter-01',
    resourceTitle: '第一章',
    filePath: './chapters/chapter-01.md',
    resourceId: '',
    versionId: '',
    fileSha1: '',
    skip: false,
  },
  // 添加更多资源...
]
```

### 扫描文件夹自动生成配置

在初始化时或使用 `batch init` 时，可以选择扫描文件夹：

**扫描目录结构：**

```
chapters/
├── chapter-01/
│   └── dist/
│       └── content.md
├── chapter-02/
│   └── dist/
│       └── content.md
└── chapter-03/
    └── dist/
        └── content.md
```

扫描后会生成：

```javascript
resources: [
  {
    name: 'chapter-01',
    resourceName: 'chapter-01',
    filePath: './chapters/chapter-01/dist',
  },
  {
    name: 'chapter-02',
    resourceName: 'chapter-02',
    filePath: './chapters/chapter-02/dist',
  },
  // ...
]
```

**扫描单个文件：**

```
chapters/
├── chapter-01.md
├── chapter-02.md
└── chapter-03.md
```

如果选择扫描单个文件并指定扩展名 `.md`，会生成：

```javascript
resources: [
  {
    name: 'chapter-01',
    resourceName: 'chapter-01',
    filePath: './chapters/chapter-01.md',
  },
  {
    name: 'chapter-02',
    resourceName: 'chapter-02',
    filePath: './chapters/chapter-02.md',
  },
  // ...
]
```

---

## 完整工作流程

### 场景一：小说合集（文件夹结构）

假设你有以下文件夹结构：

```
novel-collection/
├── freelog.collection.config.js
├── freelog.batch-resources.config.js
└── chapters/
    ├── chapter-01/
    │   └── dist/
    │       └── content.md
    ├── chapter-02/
    │   └── dist/
    │       └── content.md
    └── chapter-03/
        └── dist/
            └── content.md
```

**操作步骤：**

```bash
# 1. 初始化（选择扫描文件夹，不扫描单个文件）
freelog-cli init
# 选择：合集（含批量管理单品资源）
# 扫描文件夹：是
# 文件夹路径：./chapters
# 扫描单个文件：否

# 2. 创建合集资源
freelog-cli collection create

# 3. 批量创建单品资源
freelog-cli batch create

# 4. 批量发布单品版本
freelog-cli batch publish

# 5. 批量添加到合集
freelog-cli batch add-to-collection

# 6. 添加合集策略（可选）
freelog-cli collection policy add

# 7. 发布合集
freelog-cli collection publish
```

### 场景二：小说合集（单个文件）

假设你有以下文件结构：

```
novel-collection/
├── freelog.collection.config.js
├── freelog.batch-resources.config.js
└── chapters/
    ├── chapter-01.md
    ├── chapter-02.md
    └── chapter-03.md
```

**操作步骤：**

```bash
# 1. 初始化（选择扫描文件夹和单个文件）
freelog-cli init
# 选择：合集（含批量管理单品资源）
# 扫描文件夹：是
# 文件夹路径：./chapters
# 扫描单个文件：是
# 文件扩展名：.md

# 2-7. 后续步骤同场景一
```

**或者手动添加文件：**

```bash
# 1. 初始化（不扫描）
freelog-cli init
# 选择：合集（含批量管理单品资源）
# 扫描文件夹：否

# 2. 逐个添加文件
freelog-cli batch add ./chapters/chapter-01.md
freelog-cli batch add ./chapters/chapter-02.md
freelog-cli batch add ./chapters/chapter-03.md

# 3-7. 后续步骤同场景一
```

### 场景三：混合场景

合集中的单品可能来自不同来源：

- 部分来自当前文件夹
- 部分来自其他已创建的资源

**操作步骤：**

```bash
# 1. 初始化并扫描当前文件夹
freelog-cli init
# 扫描文件夹：是
# 文件夹路径：./chapters

# 2. 手动添加外部资源（已创建的资源）
# 编辑 freelog.batch-resources.config.js，添加：
resources: [
  // ... 扫描生成的资源
  {
    name: 'external-chapter',
    resourceName: 'external-chapter',
    resourceId: '60a1b2c3d4e5f6g7h8i9j0k1', // 已创建的资源ID
    filePath: '', // 外部资源可能不需要文件路径
    skip: false,
  },
]

# 3. 创建合集资源
freelog-cli collection create

# 4. 批量创建资源（只会创建没有 resourceId 的资源）
freelog-cli batch create

# 5. 批量发布版本（只会发布有 resourceId 但没有 versionId 的资源）
freelog-cli batch publish

# 6. 批量添加到合集
freelog-cli batch add-to-collection

# 7. 发布合集
freelog-cli collection publish
```

---

## 命令详解

### 合集命令

#### collection init

初始化合集配置文件。

```bash
freelog-cli collection init [name]
```

**选项：**
- `-c, --config <path>` - 指定合集配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
freelog-cli collection init my-collection
```

#### collection create

创建合集资源。

```bash
freelog-cli collection create [name]
```

**选项：**
- `-c, --config <path>` - 指定合集配置文件路径
- `--debug` - 调试模式

**说明：**
- 会根据配置文件创建合集资源
- 创建成功后会自动更新配置文件中的 `resourceId`

#### collection update

更新合集资源信息。

```bash
freelog-cli collection update [resource]
```

**选项：**
- `-c, --config <path>` - 指定合集配置文件路径
- `--intro <text>` - 资源介绍
- `--cover <urls>` - 封面图 URL（多个用逗号分隔）
- `--tags <tags>` - 标签（多个用逗号分隔）
- `--status <status>` - 资源状态（1:上线 4:下线）
- `--debug` - 调试模式

**示例：**
```bash
freelog-cli collection update --intro "这是一本小说合集" --tags "小说,合集"
```

#### collection item add

添加单个单品到合集。

```bash
freelog-cli collection item add <resourceIdOrName>
```

**选项：**
- `-c, --config <path>` - 指定合集配置文件路径
- `--debug` - 调试模式

**说明：**
- 需要先创建单品资源
- 会自动处理上抛资源（如果需要）

#### collection item remove

从合集中移除单品。

```bash
freelog-cli collection item remove <resourceIdOrName>
```

#### collection policy add

为合集添加授权策略。

```bash
freelog-cli collection policy add
```

#### collection publish

发布合集（提交草稿并上线）。

```bash
freelog-cli collection publish
```

**说明：**
- 会更新合集信息并提交草稿中的单品
- 发布后合集和单品都会上线

### 批量管理命令

#### batch init

初始化批量资源配置文件。

```bash
freelog-cli batch init [directory]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 可以扫描文件夹自动生成资源列表
- 支持扫描目录和单个文件

#### batch add

添加单个资源项到批量配置。

```bash
freelog-cli batch add [filePath]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 交互式添加
freelog-cli batch add

# 直接指定文件
freelog-cli batch add ./chapters/chapter-01.md
```

#### batch create

批量创建资源。

```bash
freelog-cli batch create
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 只会创建没有 `resourceId` 的资源
- 创建成功后会自动更新配置文件
- 会跳过标记为 `skip: true` 的资源

#### batch publish

批量发布资源版本。

```bash
freelog-cli batch publish
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 只会发布有 `resourceId` 但没有 `versionId` 的资源
- 会自动处理文件压缩（如果需要）
- 发布成功后会自动更新配置文件

#### batch add-to-collection

批量将资源添加到合集。

```bash
freelog-cli batch add-to-collection [collectionConfig]
```

**选项：**
- `-c, --config <path>` - 指定批量配置文件路径
- `--debug` - 调试模式

**说明：**
- 需要先创建合集资源
- 只会添加有 `resourceId` 和 `versionId` 的资源
- 会自动处理上抛资源（如果需要）
- 添加到草稿，需要执行 `collection publish` 才会正式上线

---

## 配置文件说明

### 合集配置文件

文件：`freelog.collection.config.js`

```javascript
const config = {
  // 资源ID（创建后自动填充）
  resourceId: "",
  
  // 资源名称
  resourceName: "my-collection",
  
  // 资源类型
  resourceType: ["小说合集"],
  
  // 资源类型代码
  resourceTypeCode: "novel_collection",
  
  // 资源标题
  resourceTitle: "我的小说合集",
  
  // 资源介绍
  intro: "",
  
  // 封面图列表
  coverImages: [],
  
  // 标签列表
  tags: [],
  
  // 资源状态（0:待发行 1:上架 2:冻结 4:下架）
  status: 0,
  
  // 资源策略信息
  policies: [],
  
  // 合集属性
  catalogueProperty: {
    collection_item_no_display: "collection_item_no_display_show",
    collection_item_image_display: "collection_item_image_display_show",
    collection_item_descr_display: "collection_item_descr_display_show",
    collection_view: "collection_view_list",
  },
  
  // 合集单品列表
  items: [
    {
      resourceId: "xxx",
      resourceName: "chapter-01",
      version: "1.0.0",
      itemId: "", // 添加到合集后自动填充
    },
  ],
};

module.exports = config;
```

### 批量资源配置文件

文件：`freelog.batch-resources.config.js`

```javascript
const config = {
  // 批量资源的公共配置（默认值）
  defaults: {
    // 资源类型
    resourceType: ["文本"],
    
    // 资源类型代码
    resourceTypeCode: "text",
    
    // 默认版本号
    version: "1.0.0",
    
    // 默认版本描述
    description: "",
    
    // 默认文件路径
    filePath: "./dist",
  },
  
  // 批量资源列表
  resources: [
    {
      // 资源唯一标识
      name: "chapter-01",
      
      // 资源名称
      resourceName: "chapter-01",
      
      // 资源标题
      resourceTitle: "第一章",
      
      // 文件路径（相对于配置文件）
      filePath: "./chapters/chapter-01.md",
      
      // 资源ID（创建后自动填充）
      resourceId: "",
      
      // 版本ID（发布后自动填充）
      versionId: "",
      
      // 文件SHA1值（发布后自动填充）
      fileSha1: "",
      
      // 是否跳过此资源
      skip: false,
    },
  ],
};

module.exports = config;
```

---

## 常见问题

### 1. 合集中的单品必须是已创建的资源吗？

是的。合集中的每个单品都必须是已经创建好的资源。单品资源需要：
- 先创建资源（`batch create` 或 `create`）
- 再发布版本（`batch publish` 或 `publish`）
- 最后添加到合集（`batch add-to-collection` 或 `collection item add`）

### 2. 如何跳过某个资源？

在批量配置文件中，将资源的 `skip` 字段设置为 `true`：

```javascript
{
  name: "chapter-01",
  skip: true, // 批量操作会跳过此资源
}
```

### 3. 批量操作失败怎么办？

批量操作会显示详细的成功/失败信息：

```bash
📊 创建结果:
  ✓ chapter-01: 60a1b2c3d4e5f6g7h8i9j0k1
  ✗ chapter-02: 错误信息
```

对于失败的资源，可以：
1. 检查错误信息
2. 修复问题后重新执行命令（会自动跳过已成功的资源）

### 4. 如何添加外部资源到合集？

有两种方式：

**方式一：添加到批量配置**

编辑 `freelog.batch-resources.config.js`，添加已创建的资源：

```javascript
resources: [
  {
    name: "external-resource",
    resourceName: "external-resource",
    resourceId: "60a1b2c3d4e5f6g7h8i9j0k1", // 已创建的资源ID
    versionId: "70b2c3d4e5f6g7h8i9j0k1l2", // 已发布的版本ID
    filePath: "", // 外部资源可能不需要文件路径
  },
]
```

然后执行 `batch add-to-collection`。

**方式二：直接添加到合集**

```bash
freelog-cli collection item add 60a1b2c3d4e5f6g7h8i9j0k1
```

### 5. 如何更新已添加的单品？

单品资源更新后，需要：
1. 发布新版本（`batch publish` 或 `publish`）
2. 更新合集配置中的版本号（手动编辑或重新添加）

### 6. 批量配置文件和合集配置文件的关系？

- **批量配置文件**：用于批量管理单品资源的创建和发布
- **合集配置文件**：用于管理合集本身和单品列表

批量操作完成后，会自动更新合集配置文件中的 `items` 列表。

---

## 最佳实践

### 1. 文件组织

**推荐结构：**

```
project/
├── freelog.collection.config.js      # 合集配置
├── freelog.batch-resources.config.js # 批量配置
├── chapters/                         # 章节文件夹
│   ├── chapter-01/
│   │   └── dist/
│   │       └── content.md
│   └── chapter-02/
│       └── dist/
│           └── content.md
└── README.md
```

### 2. 命名规范

- **资源名称**：使用小写字母、数字、横杠，如 `chapter-01`
- **资源标题**：使用中文，如 `第一章 开始`
- **文件路径**：使用相对路径，相对于配置文件位置

### 3. 版本管理

- 使用语义化版本号：`1.0.0`, `1.1.0`, `2.0.0`
- 在批量配置中设置默认版本号
- 单个资源可以覆盖默认版本号

### 4. 工作流程

1. **初始化阶段**：使用 `init` 命令一次性初始化所有配置
2. **开发阶段**：使用 `batch add` 添加新资源
3. **发布阶段**：按顺序执行 `create` → `publish` → `add-to-collection` → `collection publish`

### 5. 错误处理

- 批量操作失败时，检查错误信息
- 修复问题后重新执行（会自动跳过已成功的资源）
- 使用 `skip` 字段临时禁用有问题的资源

### 6. 配置管理

- 将配置文件纳入版本控制（Git）
- 不要手动修改自动生成的字段（如 `resourceId`, `versionId`）
- 定期同步配置（如果需要）

---

## 更多帮助

- 查看命令帮助：`freelog-cli batch --help`
- 查看合集命令帮助：`freelog-cli collection --help`
- 查看主文档：[README.md](../README.md)

