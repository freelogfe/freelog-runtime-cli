# 合集资源完整工作流程

本文档详细说明合集资源的创建、配置、发布等完整流程。

## 流程概览

```
1. 登录 (login)
   ↓
2. 初始化合集配置 (collection init)
   ↓
3. 创建合集资源 (collection create)
   ↓
4. 更新合集信息 (collection update) [可选]
   ↓
5. 添加授权策略 (collection policy add) [必须，上架前]
   ↓
6. 添加依赖 (collection dep add) [可选]
   ↓
7. 添加单品 (collection item add) [可选]
   ↓
8. 上架合集 (collection publish)
```

## 详细步骤说明

### 1. 登录

```bash
freelog-cli login
```

首次使用需要登录，认证信息会保存在本地。

---

### 2. 初始化合集配置

```bash
freelog-cli collection init [name]
```

**功能：**
- 创建 `freelog.collection.config.js` 配置文件
- 交互式选择资源类型（支持多级选择）
- 生成初始配置模板

**配置文件字段：**
- `resourceName` - 资源名称
- `resourceType` - 资源类型（数组）
- `intro` - 资源介绍
- `coverImages` - 封面图（数组）
- `tags` - 标签（数组）
- `status` - 资源状态（0:待发行, 1:上架, 4:下架）
- `catalogueProperty` - 合集属性配置
- `items` - 单品列表（数组）
- `dependencies` - 依赖列表（数组）
- `policies` - 策略列表（数组）

---

### 3. 创建合集资源

```bash
freelog-cli collection create [name]
```

**功能：**
- 根据配置文件创建 Freelog 合集资源
- 创建成功后会更新配置文件中的 `resourceId`
- 如果资源已存在，会提示是否覆盖

**前置条件：**
- 必须完成 `collection init`
- 配置文件中必须设置 `resourceName` 和 `resourceType`

**注意事项：**
- 创建成功后，`resourceId` 会自动保存到配置文件
- 如果配置文件中已有 `resourceId`，会提示是否覆盖

---

### 4. 更新合集信息（可选）

```bash
freelog-cli collection update [resource]
```

**功能：**
- 更新合集的介绍、封面图、标签、状态等信息
- 支持命令行选项或交互式输入

**常用选项：**
- `--intro <text>` - 资源介绍
- `--cover <urls>` - 封面图 URL（多个用逗号分隔）
- `--tags <tags>` - 标签（多个用逗号分隔）
- `--status <status>` - 资源状态（1:上架 4:下架）

**说明：**
- 可以在创建资源后随时更新
- 更新操作会同步到服务器

---

### 5. 添加授权策略（必须）

```bash
freelog-cli collection policy add
```

**功能：**
- 为合集添加授权策略
- 使用通用的策略添加逻辑（与单个资源相同）
- 支持策略模板选择、参数填写、策略编译、预览等

**执行流程：**
1. 加载合集配置
2. 获取策略模板列表
3. 选择策略模板
4. 输入策略名称
5. 填写策略参数（支持中文参数名和类型显示）
6. 编译策略
7. 预览策略翻译（可选）
8. 选择策略状态（启用/停用）
9. 保存到配置文件
10. 更新到服务器（如果已创建资源）

**重要提示：**
- **上架前必须至少有一个启用的策略**
- 策略可以在创建资源之前或之后添加
- 使用 `collection policy list` 可以查看和管理策略

---

### 6. 添加依赖（可选）

```bash
freelog-cli collection dep add <resourceIdOrName>
```

**功能：**
- 为合集添加依赖资源
- 使用通用的依赖添加逻辑（与单个资源相同）
- 包含循环依赖检查、版本选择、签约支付流程

**执行流程：**
1. 获取依赖资源信息
2. 检查资源可用性（主资源 + 上抛资源）
3. 加载合集配置并获取当前项目的 resourceId
4. **检查循环依赖**（在用户选择版本之前）
5. 确定依赖版本范围格式：
   - Minor最新方式 (`^最新版本`) - 兼容版本，允许次版本和补丁版本更新（默认推荐）
   - Patch最新方式 (`~最新版本`) - 近似版本，仅允许补丁版本更新
   - 精确版本 (`最新版本号`) - 固定版本，不允许任何更新
   - 任意版本 (`*`) - 总是使用最新版本
6. 检查是否已存在
7. 处理资源的策略选择和签约
8. 处理上抛资源的签约和支付
9. 添加依赖到配置文件
10. 保存配置

**重要提示：**
- 添加依赖前会自动检查循环依赖，如果检测到循环依赖会提示并终止操作
- 如果依赖资源需要签约，会自动处理签约流程
- 如果依赖资源需要支付，会自动处理支付流程（可选择跳过支付）

---

### 7. 添加单品（可选）

```bash
freelog-cli collection item add <resourceIdOrName>
```

**功能：**
- 为合集添加单品资源
- 处理单品的上抛资源签约和支付
- 将单品添加到合集草稿

**执行流程：**
1. 获取单品资源信息
2. 检查资源可用性（主资源 + 上抛资源）
3. 加载合集配置并获取当前项目的 resourceId
4. 确定单品版本范围格式（与依赖添加相同的版本选择逻辑）
5. 检查是否已存在
6. 处理上抛资源的签约和支付（不需要与单品本身签约）
7. 添加单品到配置文件
8. 添加到合集草稿（使用 `batchAddCollectionItemsDraft` API）

**重要提示：**
- 添加单品只需要处理上抛资源的签约，不需要与单品本身签约
- 单品会添加到合集草稿，需要执行 `collection publish` 才会正式生效
- 单品的版本范围选择逻辑与依赖添加相同

---

### 8. 删除单品（可选）

```bash
freelog-cli collection item remove <resourceIdOrName>
```

**功能：**
- 从合集中删除单品
- 从配置文件移除单品
- 从合集草稿删除单品

**执行流程：**
1. 加载合集配置
2. 查找要删除的单品
3. 确认删除
4. 从配置文件移除
5. 从合集草稿删除（使用 `batchDeleteCollectionItemsDraft` API）

---

### 9. 上架合集

```bash
freelog-cli collection publish
```

**功能：**
- 更新资源状态为上架（status: 1）
- 提交合集草稿（合并草稿到正式版本）

**执行流程：**
1. 加载合集配置
2. 检查 resourceId 是否存在
3. 更新资源状态为上架
4. 提交合集草稿（`isMergeCatalogueDraft: 1`）
5. 更新本地配置

**前置条件：**
- 必须完成 `collection create`
- **必须至少有一个启用的策略**（通过 `collection policy add` 添加）

**重要提示：**
- 上架操作会合并草稿到正式版本
- 上架后，单品和依赖才会正式生效
- 如果策略未启用，上架可能会失败

---

### 10. 下架合集（可选）

```bash
freelog-cli collection unpublish
```

**功能：**
- 更新资源状态为下架（status: 4）

**执行流程：**
1. 加载合集配置
2. 检查 resourceId 是否存在
3. 更新资源状态为下架
4. 更新本地配置

---

## 命令对比：单个资源 vs 合集

| 操作 | 单个资源 | 合集 |
|------|---------|------|
| 初始化 | `init` | `collection init` |
| 创建 | `create` | `collection create` |
| 更新信息 | `update` | `collection update` |
| 添加策略 | `policy add` | `collection policy add` |
| 查看策略 | `policy list` | `collection policy list` |
| 添加依赖 | `dep add` | `collection dep add` |
| 查看依赖 | `dep list` | ❌ 暂无 |
| 添加单品 | ❌ 不适用 | `collection item add` |
| 删除单品 | ❌ 不适用 | `collection item remove` |
| 发布/上架 | `publish` | `collection publish` |
| 下架 | `offline` | `collection unpublish` |

---

## 完整示例流程

```bash
# 1. 登录
freelog-cli login

# 2. 初始化合集配置
freelog-cli collection init my-collection

# 3. 创建合集资源
freelog-cli collection create

# 4. 更新合集信息（可选）
freelog-cli collection update --intro "这是一个合集资源"

# 5. 添加授权策略（必须，上架前）
freelog-cli collection policy add

# 6. 添加依赖（可选）
freelog-cli collection dep add <resourceId>

# 7. 添加单品（可选）
freelog-cli collection item add <resourceId>

# 8. 上架合集
freelog-cli collection publish
```

---

## 关键注意事项

1. **策略是必须的**：上架前必须至少有一个启用的策略
2. **循环依赖检查**：添加依赖前会自动检查循环依赖
3. **版本范围选择**：依赖和单品都支持 Minor最新方式、Patch最新方式、精确版本、任意版本四种格式
4. **草稿机制**：单品添加到草稿，需要执行 `publish` 才会正式生效
5. **上抛资源**：添加依赖和单品时，会自动处理上抛资源的签约和支付
6. **配置文件**：所有操作都会更新本地配置文件 `freelog.collection.config.js`

---

## 常见问题

### Q: 合集和单个资源的区别是什么？

A: 合集资源可以包含多个单品资源，而单个资源是独立的。合集的主要特点：
- 可以添加多个单品（`collection item add`）
- 单品添加到草稿，需要 `publish` 才生效
- 其他操作（策略、依赖）与单个资源逻辑相同

### Q: 添加单品和添加依赖有什么区别？

A: 
- **添加依赖**：合集本身依赖的资源，用于合集的运行
- **添加单品**：合集包含的资源，是合集的内容组成部分

### Q: 为什么添加单品不需要与单品本身签约？

A: 添加单品到合集时，只需要处理单品的上抛资源签约，不需要与单品本身签约。这是因为合集只是将单品组织在一起，不需要获得单品的授权。

### Q: 策略可以在什么时候添加？

A: 策略可以在创建资源之前或之后添加，但必须在**上架之前**添加并启用至少一个策略。

