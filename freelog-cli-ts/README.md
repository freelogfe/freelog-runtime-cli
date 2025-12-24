# Freelog CLI 使用文档

Freelog CLI 是一个用于管理和发布 Freelog 资源的命令行工具。

## 目录

- [快速开始](#快速开始)
- [完整工作流程](#完整工作流程)
- [安装](#安装)
- [认证命令](#认证命令)
- [项目命令](#项目命令)
- [依赖管理命令](#依赖管理命令)
- [策略管理命令](#策略管理命令)
- [配置文件说明](#配置文件说明)
- [常见问题](#常见问题)
- [最佳实践](#最佳实践)

---

## 快速开始

快速开始将引导您完成最基本的资源创建和发布流程。详细的工作流程请参考 [完整工作流程](#完整工作流程) 部分。

### 1. 登录

```bash
freelog-cli login
```

首次使用需要登录，认证信息会保存在本地。

### 2. 初始化项目

```bash
freelog-cli init my-project
```

选择项目类型（主题、插件、前端库或其余资源），会自动创建配置文件。

### 3. 创建资源

```bash
freelog-cli create
```

根据配置文件创建资源，创建成功后会更新配置文件中的 `resourceId`。

### 4. 配置版本信息

```bash
freelog-cli updateVersion --version 1.0.0 --description "初始版本" --filePath "./dist"
```

配置版本号、描述和文件路径等信息。

### 5. 发布版本

```bash
freelog-cli publish
```

发布资源版本到 Freelog 平台。如果资源不存在，会自动创建资源。

### 6. 添加策略

```bash
freelog-cli policy add
```

为资源添加授权策略并启用。**上架资源前必须至少有一个启用的策略**。

### 7. 上架资源

```bash
freelog-cli online
```

将资源状态设置为上架，其他用户才能看到和使用。

---

**提示：**
- 更详细的步骤说明和可选操作（如添加依赖等）请参考 [完整工作流程](#完整工作流程)
- 如果资源信息需要更新，可以使用 `freelog-cli update` 命令
- 如果资源需要依赖其他资源，可以使用 `freelog-cli dep add` 命令
- **注意**：策略可以在配置版本信息之前添加，也可以在发布版本之后添加，但必须在**上架之前**添加并启用至少一个策略

---

## 完整工作流程

以下是创建资源并发布版本的完整流程，帮助您快速了解各个命令的使用顺序和关系。

### 流程概览

```
1. 登录 (login)
   ↓
2. 初始化项目 (init)
   ↓
3. 创建资源 (create) 或 更新资源信息 (update)
   ↓
4. 配置资源信息 (update) - 可选，设置介绍、封面图、标签等
   ↓
5. 添加策略 (policy add) - 可选，建议在发布前添加
   ↓
6. 配置版本信息 (updateVersion)
   ↓
7. 添加依赖 (dep add) - 可选，如果资源需要依赖其他资源
   ↓
8. 发布版本 (publish)
   ↓
9. 上架资源 (online) - 可选，发布后可以立即上架
```

### 详细步骤

#### 步骤 1: 登录

```bash
freelog-cli login
```

首次使用需要登录，认证信息会保存在本地，后续命令无需重复登录。

---

#### 步骤 2: 初始化项目

```bash
freelog-cli init my-project
```

选择项目类型（主题、插件、前端库或其余资源），会自动创建配置文件：
- `freelog.resource.config.js` - 资源配置文件
- `freelog.version.config.js` - 版本配置文件

---

#### 步骤 3: 创建资源

**方式一：使用 create 命令创建**

```bash
freelog-cli create
```

会根据配置文件创建资源，创建成功后会更新配置文件中的 `resourceId`。

**方式二：使用 update 命令创建（如果资源不存在）**

```bash
freelog-cli update --create
```

如果配置文件中没有 `resourceId`，可以使用 `--create` 选项创建资源。

---

#### 步骤 4: 配置资源信息（可选）

更新资源的基本信息，如介绍、封面图、标签等：

```bash
# 交互式更新
freelog-cli update

# 或使用命令行参数
freelog-cli update --intro "资源介绍" --tags "标签1,标签2" --cover "./cover.jpg"
```

**说明：**
- `create` 和 `update` 的顺序可以调换
- 可以先创建资源，再更新信息
- 也可以先更新配置文件（使用 `--local-only`），再创建资源

---

#### 步骤 5: 添加策略（可选，建议在发布前添加）

为资源添加授权策略：

```bash
freelog-cli policy add
```

**说明：**
- 策略可以在配置版本信息之前或之后添加
- 建议在发布前添加策略，发布后会自动检查是否有启用的策略
- 可以添加多个策略，并设置启用/停用状态

---

#### 步骤 6: 配置版本信息

更新版本号、描述、文件路径等信息：

```bash
# 交互式更新
freelog-cli updateVersion

# 或使用命令行参数
freelog-cli updateVersion --version 1.0.0 --description "初始版本" --filePath "./dist"
```

**配置文件字段：**
- `version` - 版本号（语义化版本，如：1.0.0）
- `filePath` - 文件路径或目录路径
- `filename` - 文件名（对于非压缩类型的资源）
- `description` - 版本描述

---

#### 步骤 7: 添加依赖（可选）

如果资源需要依赖其他资源：

```bash
# 添加依赖（使用最新版本）
freelog-cli dep add <resourceId>

# 添加依赖并指定版本范围
freelog-cli dep add <resourceId>@^1.0.0

# 交互式选择版本
freelog-cli dep add <resourceId> --select-version
```

**说明：**
- 添加依赖可能需要签约和支付
- 如果支付失败，可以选择跳过支付
- 依赖信息会保存在 `freelog.version.config.js` 中

---

#### 步骤 8: 发布版本

发布资源版本到 Freelog 平台：

```bash
freelog-cli publish
```

**发布流程：**
1. 检查资源配置和版本配置
2. 如果资源不存在，会自动创建资源
3. 压缩文件（对于主题、插件、前端库类型）
4. 上传文件并计算 SHA1
5. 创建版本记录
6. 更新本地配置文件

**发布后检查：**
- 如果资源没有启用的策略，会提示添加策略并启用后可以上架资源
- 如果有启用的策略但资源未上架，会询问是否现在上架

---

#### 步骤 9: 上架资源（可选）

将资源状态设置为上架：

```bash
freelog-cli online
```

**说明：**
- 资源上架后，其他用户才能看到和使用
- 可以在发布后立即上架，也可以稍后上架
- 使用 `freelog-cli offline` 可以下架资源

---

### 流程示例

**示例 1: 完整流程（包含所有步骤）**

```bash
# 1. 登录
freelog-cli login

# 2. 初始化项目
freelog-cli init my-theme

# 3. 创建资源
freelog-cli create

# 4. 更新资源信息
freelog-cli update --intro "我的主题" --tags "主题,UI" --cover "./cover.jpg"

# 5. 添加策略
freelog-cli policy add

# 6. 配置版本信息
freelog-cli updateVersion --version 1.0.0 --description "初始版本" --filePath "./dist"

# 7. 添加依赖（如果需要）
freelog-cli dep add 507f1f77bcf86cd799439011

# 8. 发布版本
freelog-cli publish

# 9. 上架资源
freelog-cli online
```

**示例 2: 简化流程（最小步骤）**

```bash
# 1. 登录
freelog-cli login

# 2. 初始化项目
freelog-cli init my-resource

# 3. 创建资源（会自动创建）
freelog-cli publish  # publish 会自动创建资源（如果不存在）

# 4. 上架资源
freelog-cli online
```

**示例 3: 先配置后创建**

```bash
# 1. 登录
freelog-cli login

# 2. 初始化项目
freelog-cli init my-resource

# 3. 编辑配置文件，设置资源信息
# 编辑 freelog.resource.config.js

# 4. 只更新配置文件（不创建资源）
freelog-cli update --intro "资源介绍" --local-only

# 5. 创建资源（使用配置文件中的信息）
freelog-cli create

# 6. 配置版本信息
freelog-cli updateVersion --version 1.0.0

# 7. 发布版本
freelog-cli publish
```

---

### 命令顺序说明

**必须按顺序执行的命令：**
- `init` → `create` 或 `update --create`（必须先初始化）
- `updateVersion` → `publish`（必须先配置版本信息）

**可以调换顺序的命令：**
- `create` 和 `update`：可以先创建再更新，也可以先更新配置文件再创建
- `policy add`：可以在 `updateVersion` 之前或之后添加
- `dep add`：可以在 `updateVersion` 之前或之后添加

**可选步骤：**
- `update`：如果资源信息已经配置好，可以跳过
- `policy add`：如果不需要策略，可以跳过
- `dep add`：如果资源没有依赖，可以跳过
- `online`：如果不想立即上架，可以稍后上架

---

## 安装

```bash
npm install -g freelog-cli-ts
```

或使用本地安装：

```bash
npm install freelog-cli-ts
npx freelog-cli
```

---

## 认证命令

### login - 用户登录

登录到 Freelog 平台。

**语法：**
```bash
freelog-cli login [选项]
```

**选项：**
- `-g, --global` - 全局登录（认证信息保存在用户主目录）
- `-u, --username <username>` - 用户名或邮箱（可选）
- `-p, --password <password>` - 密码（可选）

**示例：**
```bash
# 交互式登录（工作空间登录）
freelog-cli login

# 全局登录
freelog-cli login --global

# 使用命令行参数登录
freelog-cli login -u myusername -p mypassword
```

**说明：**
- **工作空间登录**：认证信息保存在当前项目目录或其父目录的 `.freelog-auth` 文件中
- **全局登录**：认证信息保存在用户主目录的 `.freelog-auth` 文件中
- 工作空间登录优先于全局登录
- 登录成功后，CLI 会自动保存认证信息，后续命令无需重复登录

---

### logout - 退出登录

清除本地保存的认证信息。

**语法：**
```bash
freelog-cli logout [选项]
```

**选项：**
- `-g, --global` - 退出全局登录

**示例：**
```bash
# 退出工作空间登录
freelog-cli logout

# 退出全局登录
freelog-cli logout --global
```

---

### status - 查看登录状态

查看当前登录状态和用户信息。

**语法：**
```bash
freelog-cli status
```

**示例：**
```bash
freelog-cli status
```

**说明：**
- 显示当前登录用户信息
- 显示使用的环境（测试/生产）
- 显示认证信息存储位置（工作空间/全局）

---

## 项目命令

### init - 初始化项目

初始化一个新的 Freelog 项目，支持主题、插件、前端库和其余资源类型。

**语法：**
```bash
freelog-cli init [项目名称] [选项]
```

**选项：**
- `-f, --force` - 强制清空已存在的目录
- `--debug` - 调试模式

**项目类型：**
1. **主题** - 创建主题项目模板
2. **插件** - 创建插件项目模板
3. **前端库** - 创建前端库项目模板
4. **其余资源** - 创建其余资源类型项目（仅创建配置文件）

**示例：**
```bash
# 交互式初始化（会提示选择项目类型和名称）
freelog-cli init

# 指定项目名称初始化
freelog-cli init my-theme

# 强制覆盖已存在的目录
freelog-cli init my-theme --force
```

**说明：**
- 对于**主题、插件、前端库**：会创建项目目录并下载模板，包含完整的项目结构
- 对于**其余资源**：在当前目录创建配置文件，需要先登录以选择资源类型
- 项目名称只能包含英文字母、数字、下划线和横杠

**生成的文件：**
- `freelog.resource.config.js` - 资源配置文件
- `freelog.version.config.js` - 版本配置文件
- `README.md` - 项目说明文档

---

### create - 创建资源

在 Freelog 平台创建资源，需要先配置好 `freelog.resource.config.js` 文件。

**语法：**
```bash
freelog-cli create [资源名称] [选项]
```

**选项：**
- `-c, --config <path>` - 指定资源配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 使用配置文件中的信息创建资源
freelog-cli create

# 指定资源名称创建
freelog-cli create my-resource-name

# 使用指定的配置文件
freelog-cli create -c ./custom-config.js
```

**说明：**
- 命令执行前会显示当前登录用户信息并要求确认
- 如果配置文件中已有 `resourceId`，会提示是否继续创建新资源
- 如果缺少必填字段（`resourceName`、`resourceTypeCode` 或 `resourceType`），会交互式提示输入
- 创建成功后会更新本地配置文件，保存服务器返回的资源信息（包括 `resourceId`）

**必填字段：**
- `resourceName` - 资源名称
- `resourceTypeCode` - 资源类型代码（如：`RT001`）
- `resourceType` - 资源类型数组（如：`['主题']`）

---

### update - 更新资源信息

更新资源的基本信息，包括介绍、封面图、标签和状态。

**语法：**
```bash
freelog-cli update [资源ID或名称] [选项]
```

**选项：**
- `-c, --config <path>` - 指定资源配置文件路径
- `--intro <text>` - 资源介绍（最多200个字符）
- `--cover <path>` - 封面图：已上传的图片URL或本地文件路径（本地文件会自动上传）
- `--tags <tags>` - 标签（多个用逗号分隔，单个标签最多20个字符）
- `--status <status>` - 资源状态（1:上架 4:下架）
- `--local-only` - 只更新配置文件，不同步到服务器
- `--create` - 如果资源不存在则创建资源
- `--debug` - 调试模式

**示例：**
```bash
# 交互式更新（会提示选择要更新的字段）
freelog-cli update

# 更新资源介绍
freelog-cli update --intro "这是更新后的介绍"

# 更新封面图（本地文件会自动上传）
freelog-cli update --cover "./images/cover.jpg"

# 更新封面图（使用已上传的URL）
freelog-cli update --cover "https://image.freelog.com/preview-image/xxx.jpg"

# 更新标签
freelog-cli update --tags "React,Vue,UI"

# 更新资源状态（上架）
freelog-cli update --status 1

# 同时更新多个字段
freelog-cli update --intro "新介绍" --tags "新标签" --status 1

# 指定资源ID更新
freelog-cli update 507f1f77bcf86cd799439011 --intro "新介绍"

# 只更新配置文件，不同步到服务器
freelog-cli update --intro "新介绍" --local-only

# 如果资源不存在则创建资源
freelog-cli update --intro "新介绍" --create
```

**说明：**
- 命令执行前会显示当前登录用户信息并要求确认（使用 `--local-only` 且不需要上传封面图时不需要登录）
- 如果不指定资源ID或名称，会从 `freelog.resource.config.js` 中读取 `resourceId`
- 如果不提供任何选项，会交互式选择要更新的字段
- **默认行为**：更新前会先同步服务器上的资源信息，然后更新服务器和本地配置文件
- **`--local-only` 选项**：只更新本地配置文件，不调用 API 同步到服务器
  - 使用此选项时，封面图必须是已上传的URL（不能是本地文件路径）
  - 不需要登录（除非需要上传封面图）
- **`--create` 选项**：如果资源不存在，会自动创建资源
  - 需要确保配置文件中包含必填字段（`resourceName`、`resourceTypeCode`、`resourceType`）
- 更新成功后会同时更新服务器和本地配置文件（除非使用 `--local-only`）

**可更新的字段：**
- `intro` - 资源介绍（支持 Markdown 格式，最多200个字符）
- `coverImages` - 封面图（单张，支持本地文件路径或已上传的URL）
- `tags` - 标签列表（最多20个，单个标签最多20个字符）
- `status` - 资源状态（1:上架 4:下架）

**注意事项：**
- 封面图如果是本地文件路径，会自动上传到 Freelog 存储服务
- 封面图不支持外部URL（非 `https://image.freelog.com/preview-image` 开头的URL）
- 标签会自动去重，如果输入了重复标签会提示确认
- 策略信息会从服务器同步，但不会通过此命令修改

---

### publish - 发布版本

发布资源版本到 Freelog 平台。

**语法：**
```bash
freelog-cli publish [选项]
```

**选项：**
- `-c, --config <path>` - 指定配置文件路径
- `-m, --message <message>` - 版本更新说明
- `--debug` - 调试模式

**示例：**
```bash
# 发布版本
freelog-cli publish

# 指定配置文件
freelog-cli publish -c ./custom-config.js

# 指定版本说明
freelog-cli publish -m "修复了若干bug"
```

**说明：**
- 命令执行前会显示当前登录用户信息并要求确认
- 会自动加载 `freelog.resource.config.js` 和 `freelog.version.config.js` 配置文件
- 如果资源不存在，会自动创建资源
- 对于**主题、插件、前端库**类型，会自动压缩 `filePath` 指定的目录为 ZIP 文件
- 对于其他类型，直接上传 `filePath` 指定的文件
- 会自动计算文件的 SHA1 值，如果服务器已存在相同 SHA1 的文件，则不会重复上传
- 发布成功后会更新本地配置文件
- **发布成功后会自动检查**：
  - 如果资源没有启用的策略，会提示添加策略并启用后可以上架资源
  - 如果有启用的策略但资源未上架，会询问是否现在上架

**配置文件要求：**
- `freelog.version.config.js` 中需要配置：
  - `version` - 版本号（如：`1.0.0`）
  - `filePath` - 文件路径或目录路径（可选，如：`dist`）
    - 对于**主题、插件、前端库**：应为目录路径，会自动压缩为 ZIP
    - 对于**其他类型**：可以为空或目录路径，会与 `filename` 组合
  - `filename` - 文件名（必填，对于不需要压缩的资源类型）
  - `description` - 版本描述（可选，如果为空会提示输入）

**文件处理：**
- **主题、插件、前端库**：
  - `filePath` 应为目录路径（如：`dist`），会自动压缩为 ZIP
  - 压缩后的文件名为：`{resourceName}-{version}.zip`
- **其他类型**：
  - `filename` 必填（如：`index.js`）
  - `filePath` 可选：
    - 如果 `filePath` 为空：文件路径为当前目录 + `filename`（如：`./index.js`）
    - 如果 `filePath` 不为空：文件路径为 `filePath + filename`（如：`dist/index.js`）

---

### syncr - 同步资源信息

从服务器同步资源信息到本地配置文件。

**语法：**
```bash
freelog-cli syncr [资源ID或名称] [选项]
```

**选项：**
- `-c, --config <path>` - 指定配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 从配置文件读取 resourceId 并同步
freelog-cli syncr

# 指定资源ID同步
freelog-cli syncr 507f1f77bcf86cd799439011

# 指定资源名称同步
freelog-cli syncr my-resource-name

# 使用指定的配置文件
freelog-cli syncr -c ./custom-config.js
```

**说明：**
- 命令执行前会显示当前登录用户信息并要求确认
- 如果不指定资源ID或名称，会从 `freelog.resource.config.js` 中读取 `resourceId`
- 同步成功后会更新本地 `freelog.resource.config.js` 文件
- 同步的信息包括：`resourceId`、`resourceName`、`resourceType`、`resourceTitle`、`intro`、`coverImages`、`tags`、`status`、`policies` 等

**同步的字段：**
- `resourceId` - 资源ID
- `resourceName` - 资源名称
- `resourceType` - 资源类型数组
- `resourceTitle` - 资源标题
- `resourceTypeCode` - 资源类型代码
- `intro` - 资源介绍
- `coverImages` - 封面图列表
- `tags` - 标签列表
- `status` - 资源状态
- `policies` - 策略信息

---

### syncv - 同步版本信息

从服务器同步版本信息到本地配置文件。

**语法：**
```bash
freelog-cli syncv [资源ID或名称] [选项]
```

**选项：**
- `-v, --version <version>` - 指定版本号或 `latest`（不传则使用配置文件版本或最新版本）
- `-c, --config <path>` - 指定配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 从配置文件读取 resourceId 并同步最新版本
freelog-cli syncv

# 同步指定版本
freelog-cli syncv -v 1.0.0

# 同步最新版本
freelog-cli syncv -v latest

# 指定资源ID同步
freelog-cli syncv 507f1f77bcf86cd799439011

# 指定资源ID和版本号
freelog-cli syncv 507f1f77bcf86cd799439011 -v 1.0.0
```

**说明：**
- 命令执行前会显示当前登录用户信息并要求确认
- 如果不指定资源ID或名称，会从 `freelog.resource.config.js` 中读取 `resourceId`
- 如果不指定版本号，会提示使用本地配置的版本或最新版本
- 同步成功后会更新本地 `freelog.version.config.js` 文件
- 资源信息优先从 `version.config` 获取，如果没有则从 `resource.config` 获取

**同步的字段：**
- `version` - 版本号
- `versionId` - 版本ID
- `fileSha1` - 文件SHA1值
- `description` - 版本描述
- `dependencies` - 依赖列表
- `upcastResources` - 上抛资源列表
- `resourceId` - 资源ID
- `resourceName` - 资源名称
- `resourceType` - 资源类型

---

### updateVersion - 更新版本配置信息

更新版本配置文件中的版本号、描述、文件名和文件路径。

**语法：**
```bash
freelog-cli updateVersion [选项]
```

**选项：**
- `-c, --config <path>` - 指定版本配置文件路径
- `--version <version>` - 版本号（格式: x.y.z）
- `--description <text>` - 版本描述
- `--filename <filename>` - 文件名
- `--filePath <path>` - 文件路径（相对于当前目录）
- `--debug` - 调试模式

**示例：**
```bash
# 交互式更新（会提示选择要更新的字段）
freelog-cli updateVersion

# 更新版本号
freelog-cli updateVersion --version 1.1.0

# 更新版本描述
freelog-cli updateVersion --description "修复了若干bug"

# 更新文件名
freelog-cli updateVersion --filename "my-resource-v1.1.0.zip"

# 更新文件路径
freelog-cli updateVersion --filePath "./dist/build"

# 同时更新多个字段
freelog-cli updateVersion --version 1.1.0 --description "新版本" --filename "v1.1.0.zip"
```

**说明：**
- 命令执行前会显示当前登录用户信息并要求确认
- 如果不提供任何参数，会交互式选择要更新的字段
- 版本号格式验证：必须符合 x.y.z 格式（如：1.0.0）
- 文件路径验证：会检查文件或目录是否存在
- 更新成功后会保存到配置文件，保留注释和格式

**可更新的字段：**
- `version` - 版本号（语义化版本，如：1.0.0）
- `description` - 版本描述
- `filename` - 文件名（用于非压缩类型的资源）
- `filePath` - 文件路径或目录路径（相对于配置文件）

---

### online - 上架资源

将资源状态设置为上架。

**语法：**
```bash
freelog-cli online [资源ID或名称] [选项]
```

**选项：**
- `-c, --config <path>` - 指定配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 从配置文件读取 resourceId 并上架
freelog-cli online

# 指定资源ID上架
freelog-cli online 507f1f77bcf86cd799439011

# 指定资源名称上架
freelog-cli online my-resource-name

# 使用指定的配置文件
freelog-cli online -c ./custom-config.js
```

**说明：**
- 命令执行前会显示当前登录用户信息并要求确认
- 如果不指定资源ID或名称，会从 `freelog.resource.config.js` 中读取 `resourceId`
- 上架操作会将资源状态设置为 `1`（上架）
- 上架成功后会自动更新本地配置文件

---

### offline - 下架资源

将资源状态设置为下架。

**语法：**
```bash
freelog-cli offline [资源ID或名称] [选项]
```

**选项：**
- `-c, --config <path>` - 指定配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 从配置文件读取 resourceId 并下架
freelog-cli offline

# 指定资源ID下架
freelog-cli offline 507f1f77bcf86cd799439011

# 指定资源名称下架
freelog-cli offline my-resource-name

# 使用指定的配置文件
freelog-cli offline -c ./custom-config.js
```

**说明：**
- 命令执行前会显示当前登录用户信息并要求确认
- 如果不指定资源ID或名称，会从 `freelog.resource.config.js` 中读取 `resourceId`
- 下架操作会将资源状态设置为 `4`（下架）
- 下架成功后会自动更新本地配置文件

---

## 依赖管理命令

### dep add - 添加依赖

为资源添加依赖，支持完整的签约支付流程。

**语法：**
```bash
freelog-cli dep add <resourceIdOrName> [选项]
```

**选项：**
- `-sv, --select-version` - 交互式选择版本
- `-c, --config <path>` - 指定配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 添加依赖（使用最新版本）
freelog-cli dep add 507f1f77bcf86cd799439011

# 添加依赖并指定版本范围
freelog-cli dep add 507f1f77bcf86cd799439011@^1.0.0

# 交互式选择版本
freelog-cli dep add 507f1f77bcf86cd799439011 --select-version

# 使用资源名称添加
freelog-cli dep add my-resource-name
```

**说明：**
- 命令执行前会显示当前登录用户信息并要求确认
- 支持通过资源ID或资源名称添加依赖
- 支持版本范围格式：`^1.0.0`、`~2.3.0`、`*`、`1.2.3`
- 如果依赖资源需要签约，会自动处理签约流程
- 如果依赖资源需要支付，会自动处理支付流程（可选择跳过支付）
- 添加成功后会更新 `freelog.version.config.js` 中的 `dependencies` 字段

**版本格式：**
- `^1.0.0` - 兼容版本（1.0.0 <= version < 2.0.0）
- `~2.3.0` - 近似版本（2.3.0 <= version < 2.4.0）
- `*` - 任意版本
- `1.2.3` - 精确版本

---

### dep remove - 移除依赖

从资源配置中移除依赖。

**语法：**
```bash
freelog-cli dep remove <resourceIdOrName> [选项]
```

**选项：**
- `-c, --config <path>` - 指定配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 移除依赖
freelog-cli dep remove 507f1f77bcf86cd799439011

# 使用资源名称移除
freelog-cli dep remove my-resource-name
```

**说明：**
- 从本地配置文件中移除依赖，不会影响服务器上的资源
- 移除成功后会更新 `freelog.version.config.js` 文件

---

### dep list - 查看依赖列表

查看当前资源的所有依赖。

**语法：**
```bash
freelog-cli dep list [选项]
```

**选项：**
- `--tree` - 以树形结构显示（包含依赖的依赖）
- `-c, --config <path>` - 指定配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 查看依赖列表
freelog-cli dep list

# 以树形结构显示
freelog-cli dep list --tree
```

**说明：**
- 显示所有依赖的资源ID、名称和版本范围
- 使用 `--tree` 选项可以显示依赖的依赖（递归显示）

---

### dep update - 更新依赖版本

更新依赖的版本范围。

**语法：**
```bash
freelog-cli dep update <resourceIdOrName> [选项]
```

**选项：**
- `-sv, --select-version` - 交互式选择版本
- `-c, --config <path>` - 指定配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 更新依赖版本
freelog-cli dep update 507f1f77bcf86cd799439011

# 交互式选择版本
freelog-cli dep update 507f1f77bcf86cd799439011 --select-version
```

**说明：**
- 更新依赖的版本范围
- 如果使用 `--select-version`，会列出所有可用版本供选择

---

### dep change - 修改依赖配置

修改依赖的配置信息（如版本范围）。

**语法：**
```bash
freelog-cli dep change <resource> [选项]
```

**选项：**
- `-c, --config <path>` - 指定配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 修改依赖配置
freelog-cli dep change 507f1f77bcf86cd799439011
```

**说明：**
- 交互式修改依赖的配置信息
- 可以修改版本范围等配置

---

### dep sync - 同步依赖版本

同步依赖版本，可以更新所有依赖到最新版本。

**语法：**
```bash
freelog-cli dep sync [version] [选项]
```

**选项：**
- `-c, --config <path>` - 指定配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 交互式同步（会提示选择每个依赖的版本）
freelog-cli dep sync

# 更新所有依赖到最新版本
freelog-cli dep sync latest
```

**说明：**
- 默认情况下会交互式选择每个依赖的版本
- 传入 `latest` 会更新所有依赖到最新版本
- 同步成功后会更新配置文件

---

## 策略管理命令

### policy add - 添加授权策略

为资源添加授权策略。

**语法：**
```bash
freelog-cli policy add [选项]
```

**选项：**
- `-c, --config <path>` - 指定资源配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 交互式添加策略
freelog-cli policy add
```

**说明：**
- 命令执行前会显示当前登录用户信息并要求确认
- 交互式选择策略模板
- 输入策略名称
- 填写策略参数（会显示完整的策略预览，参数位置用黄色标记）
- 预览策略翻译
- 选择策略的启用状态（启用/停用）
- 添加成功后会更新 `freelog.resource.config.js` 中的 `policies` 字段
- 如果服务器更新失败，会自动回滚配置文件

**策略参数说明：**
- 策略参数预览会显示完整的策略内容，参数位置用 `【参数X: 参数名称(类型)】` 标记
- 如果参数名称和类型相同，只显示一个（如：`【参数1: 时间单位】`）
- 已填写的参数会显示实际值（绿色）
- 未填写的参数显示标记（黄色）

---

### policy list - 列出策略

列出资源的所有策略并管理策略状态（启用/停用）。

**语法：**
```bash
freelog-cli policy list [选项]
```

**选项：**
- `-c, --config <path>` - 指定资源配置文件路径
- `--debug` - 调试模式

**示例：**
```bash
# 列出所有策略
freelog-cli policy list
```

**说明：**
- 显示所有策略的名称、状态和策略文本
- 可以交互式启用或停用策略
- 更新成功后会同步到服务器和本地配置文件

---

## 配置文件说明

### freelog.resource.config.js

资源配置文件，包含资源的基本信息。

**主要字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `resourceId` | string | 否 | 资源ID（24位十六进制字符串，创建资源后自动填充） |
| `resourceName` | string | 是 | 资源名称（用于标识资源） |
| `resourceType` | string[] | 是 | 资源类型数组（如：`['主题']`、`['插件']`） |
| `resourceTypeCode` | string | 是 | 资源类型代码（如：`RT001`） |
| `resourceTitle` | string | 否 | 资源标题（显示给用户的标题） |
| `intro` | string | 否 | 资源介绍（支持 Markdown 格式，最多200个字符） |
| `coverImages` | string[] | 否 | 封面图URL列表（单张，支持本地文件路径） |
| `tags` | string[] | 否 | 标签列表（最多20个，单个标签最多20个字符） |
| `status` | number | 否 | 资源状态（0:待发行 1:上架 2:冻结 4:下架） |
| `policies` | PolicyInfo[] | 否 | 策略信息列表 |

**配置文件示例：**
```javascript
const config = {
  resourceId: "",
  resourceName: "my-theme",
  resourceType: ["主题"],
  resourceTypeCode: "RT001",
  resourceTitle: "我的主题",
  intro: "这是一个漂亮的主题",
  coverImages: ["https://image.freelog.com/preview-image/xxx.jpg"],
  tags: ["主题", "UI"],
  status: 0,
  policies: [
    {
      policyName: "免费策略",
      policyText: "免费使用",
      status: 1,
      policyId: "" // 添加后自动填充
    }
  ]
};

module.exports = config;
```

---

### freelog.version.config.js

版本配置文件，包含版本相关的信息。

**主要字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | string | 是 | 版本号（语义化版本，如：`1.0.0`） |
| `filePath` | string | 是 | 文件路径或目录路径（如：`dist`） |
| `filename` | string | 否 | 文件名（用于非压缩类型的资源） |
| `fileSha1` | string | 否 | 文件SHA1值（40位十六进制，发布后自动填充） |
| `versionId` | string | 否 | 版本ID（发布后自动填充） |
| `description` | string | 否 | 版本描述（支持 Markdown 格式） |
| `dependencies` | Dependency[] | 否 | 依赖列表 |
| `baseUpcastResources` | BaseUpcastResource[] | 否 | 上抛资源列表 |
| `resourceId` | string | 否 | 资源ID（会从 resource.config 获取） |
| `resourceName` | string | 否 | 资源名称（会从 resource.config 获取） |
| `resourceType` | string | 否 | 资源类型（会从 resource.config 获取） |
| `userId` | number | 否 | 用户ID（创建资源后自动填充） |

**依赖格式：**
```javascript
dependencies: [
  {
    resourceId: "507f1f77bcf86cd799439011",
    resourceName: "依赖资源名称", // 可选，用于可读性
    versionRange: "^1.0.0" // 版本范围：^1.0.0, ~2.3.0, *, 1.2.3
  }
]
```

**配置文件示例：**
```javascript
const config = {
  resourceId: "",
  resourceType: "主题",
  resourceName: "my-theme",
  userId: 0,
  description: "初始版本",
  version: "1.0.0",
  versionId: "",
  fileSha1: "",
  dependencies: [],
  upcastResources: [],
  resolveResources: [],
  systemProperty: {},
  customProperty: {},
  customPropertyDescriptors: [],
  catalogueProperty: {},
  createDate: "",
  filename: "",
  baseUpcastResources: [],
  batchSignContracts: [],
  inputAttrs: [],
  authExcludedItems: [],
  filePath: "dist"
};

module.exports = config;
```

**文件路径说明：**
- **主题、插件、前端库**：`filePath` 应为目录路径，会自动压缩为 ZIP
- **其他类型**：`filePath` 可以是目录或文件路径，`filename` 用于指定文件名

---

## 常见问题

### 1. 如何查看当前登录状态？

```bash
freelog-cli status
```

### 2. 如何切换测试环境和生产环境？

在命令前添加 `-t` 选项使用测试环境：
```bash
freelog-cli -t login
```

默认使用生产环境。

### 3. 创建资源失败怎么办？

使用 `--debug` 选项查看详细的请求信息：
```bash
freelog-cli create --debug
```

这会显示：
- 调用的接口
- 完整的请求URL
- 请求方法
- 请求数据（JSON格式）

### 4. 工作空间登录和全局登录的区别？

- **工作空间登录**：认证信息保存在项目目录或其父目录的 `.freelog-auth` 文件中，只对当前项目有效
- **全局登录**：认证信息保存在用户主目录的 `.freelog-auth` 文件中，对所有项目有效

工作空间登录优先于全局登录。

### 5. 如何查看命令帮助？

```bash
# 查看所有命令
freelog-cli --help

# 查看特定命令的帮助
freelog-cli create --help
freelog-cli publish --help
freelog-cli dep --help
```

### 6. 如何更新版本配置信息？

使用 `updateVersion` 命令：

```bash
# 交互式更新
freelog-cli updateVersion

# 命令行更新
freelog-cli updateVersion --version 1.1.0 --description "新版本"
```

### 7. 如何管理依赖？

```bash
# 添加依赖
freelog-cli dep add <resourceId>

# 查看依赖列表
freelog-cli dep list

# 更新依赖版本
freelog-cli dep update <resourceId>

# 同步所有依赖到最新版本
freelog-cli dep sync latest
```

### 8. 如何上架/下架资源？

```bash
# 上架资源
freelog-cli online

# 下架资源
freelog-cli offline
```

### 9. 版本号格式要求？

版本号必须遵循语义化版本规范：`x.y.z`
- `x` - 主版本号（不兼容的 API 修改）
- `y` - 次版本号（向下兼容的功能性新增）
- `z` - 修订号（向下兼容的问题修正）

示例：`1.0.0`、`2.1.3`、`0.1.0`

### 10. 依赖版本范围格式？

支持以下版本范围格式：
- `^1.0.0` - 兼容版本（1.0.0 <= version < 2.0.0）
- `~2.3.0` - 近似版本（2.3.0 <= version < 2.4.0）
- `*` - 任意版本
- `1.2.3` - 精确版本

### 11. 封面图支持哪些格式？

- **已上传的图片URL**：必须以 `https://image.freelog.com/preview-image` 开头
- **本地文件路径**：会自动上传到 Freelog 存储服务，上传后返回的URL会保存到配置文件
- **不支持**：外部URL（非 Freelog 存储服务的URL）

### 12. 策略添加失败会回滚吗？

是的。如果策略添加到配置文件后，服务器更新失败，会自动回滚配置文件到添加前的状态，并提示用户。

---

## 最佳实践

### 1. 项目初始化

```bash
# 推荐流程
freelog-cli login
freelog-cli init my-project
# 选择项目类型
# 编辑配置文件
freelog-cli create
```

### 2. 版本管理

- 使用语义化版本号：`1.0.0`、`1.1.0`、`2.0.0`
- 每次发布前更新版本号
- 使用 `updateVersion` 命令更新版本配置

### 3. 依赖管理

- 使用版本范围而不是精确版本（如：`^1.0.0` 而不是 `1.0.0`）
- 定期使用 `dep sync latest` 更新依赖
- 使用 `dep list --tree` 查看依赖树

### 4. 配置文件管理

- 将配置文件纳入版本控制（Git）
- 不要手动修改自动生成的字段（如 `resourceId`、`versionId`）
- 定期使用 `syncr` 和 `syncv` 同步服务器信息

### 5. 发布流程

```bash
# 推荐发布流程
freelog-cli updateVersion --version 1.1.0 --description "新功能"
freelog-cli publish
# 如果发布成功且没有启用的策略，会提示添加策略
# 如果有启用的策略但未上架，会询问是否上架
freelog-cli online  # 如果需要上架
```

### 6. 错误处理

- 使用 `--debug` 选项查看详细错误信息
- 检查配置文件格式是否正确
- 确认文件路径是否存在
- 检查网络连接和登录状态

---

## 交互操作说明

在使用 CLI 进行交互式操作时，请注意以下操作方式：

### 多选操作（Checkbox）

当命令提示您进行多选时（例如选择要更新的字段），请使用以下操作方式：

- **空格键**：选中/取消选中当前项
- **方向键（↑↓）**：上下移动光标
- **回车键（Enter）**：确认选择并继续

**示例场景**：
- 选择要更新的字段（`update` 命令）
- 选择要同步的资源（`syncr` 命令）

### 单选操作（List）

当命令提示您进行单选时（例如选择资源类型、状态等），请使用以下操作方式：

- **方向键（↑↓）**：上下移动光标
- **回车键（Enter）**：确认选择并继续

### 确认操作（Confirm）

当命令提示您确认操作时，请使用以下操作方式：

- **Y/y** 或 **回车键**：确认操作
- **N/n**：取消操作

---

## 命令流程图

### 创建和发布资源的完整流程

```
1. 登录 (login)
   ↓
2. 初始化项目 (init)
   ↓
3. 配置资源信息 (编辑 freelog.resource.config.js)
   ↓
4. 创建资源 (create)
   ↓
5. 添加策略 (policy add) [可选]
   ↓
6. 配置版本信息 (编辑 freelog.version.config.js)
   ↓
7. 添加依赖 (dep add) [可选]
   ↓
8. 发布版本 (publish)
   ↓
9. 上架资源 (online)
```

### 更新资源的流程

```
1. 登录 (login)
   ↓
2. 更新资源信息 (update)
   ↓
3. 更新版本配置 (updateVersion) [可选]
   ↓
4. 发布新版本 (publish)
```

### 同步信息的流程

```
1. 登录 (login)
   ↓
2. 同步资源信息 (syncr)
   ↓
3. 同步版本信息 (syncv)
   ↓
4. 同步依赖版本 (dep sync) [可选]
```

### 依赖管理流程

```
1. 登录 (login)
   ↓
2. 查看依赖列表 (dep list)
   ↓
3. 添加依赖 (dep add)
   ↓
4. 更新依赖版本 (dep update)
   ↓
5. 同步依赖 (dep sync)
```

---

## 注意事项

1. **登录状态**：大部分命令需要先登录，执行前会显示当前登录用户信息并要求确认
2. **配置文件**：确保配置文件格式正确，字段类型匹配
3. **文件路径**：`filePath` 可以是相对路径或绝对路径，确保文件或目录存在
4. **资源类型**：`resourceType` 必须是数组格式，如：`['主题']`
5. **版本号**：遵循语义化版本规范（如：`1.0.0`）
6. **文件大小**：上传的文件大小有限制，请参考 Freelog 平台文档
7. **依赖管理**：添加依赖可能需要签约和支付，请确保账户有足够余额
8. **策略管理**：策略文本支持 Markdown 格式，可以包含多行内容
9. **配置文件格式**：支持 `.js` 和 `.ts` 格式，建议使用 `.js` 格式（更简单）
10. **封面图**：本地文件会自动上传，不支持手动编辑配置文件中的本地路径

---

## 快速参考

### 常用命令组合

**首次创建和发布资源：**
```bash
freelog-cli login
freelog-cli init my-project
# 编辑配置文件
freelog-cli create
freelog-cli publish
freelog-cli online
```

**更新资源并发布新版本：**
```bash
freelog-cli update --intro "更新后的介绍"
freelog-cli updateVersion --version 1.1.0 --description "新功能"
freelog-cli publish
```

**添加依赖并发布：**
```bash
freelog-cli dep add <resourceId>
freelog-cli publish
```

**同步最新信息：**
```bash
freelog-cli syncr
freelog-cli syncv
freelog-cli dep sync latest
```

### 命令速查表

| 命令 | 功能 | 常用选项 |
|------|------|---------|
| `login` | 登录 | `-g` (全局登录) |
| `init` | 初始化项目 | `-f` (强制覆盖) |
| `create` | 创建资源 | `-c` (指定配置) |
| `update` | 更新资源信息 | `--intro`, `--tags`, `--status` |
| `updateVersion` | 更新版本配置 | `--version`, `--description`, `--filePath` |
| `publish` | 发布版本 | `-c` (指定配置) |
| `online` | 上架资源 | `-c` (指定配置) |
| `offline` | 下架资源 | `-c` (指定配置) |
| `syncr` | 同步资源信息 | `-c` (指定配置) |
| `syncv` | 同步版本信息 | `-v` (指定版本) |
| `dep add` | 添加依赖 | `-sv` (选择版本) |
| `dep list` | 查看依赖 | `--tree` (树形显示) |
| `dep sync` | 同步依赖 | `latest` (更新到最新) |
| `policy add` | 添加策略 | `-c` (指定配置) |
| `policy list` | 列出策略 | `-c` (指定配置) |

---

## 更多帮助

如有问题，请查看：
- [Freelog 官方文档](https://doc.freelog.com/)
- [GitHub Issues](https://github.com/freelog/freelog-runtime-cli/issues)

---

## 版本历史

查看 CLI 版本：
```bash
freelog-cli --version
```

查看更新日志和功能变更，请参考项目的 CHANGELOG.md 文件。
