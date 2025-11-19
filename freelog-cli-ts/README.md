# Freelog CLI 使用文档

本文档介绍 Freelog CLI 的核心命令使用方法。

## 目录

- [Freelog CLI 使用文档](#freelog-cli-使用文档)
  - [目录](#目录)
  - [认证命令](#认证命令)
    - [login - 用户登录](#login---用户登录)
    - [logout - 退出登录](#logout---退出登录)
  - [项目命令](#项目命令)
    - [init - 初始化项目](#init---初始化项目)
    - [create - 创建资源](#create---创建资源)
    - [publish - 发布版本](#publish---发布版本)
    - [syncr - 同步资源信息](#syncr---同步资源信息)
    - [syncv - 同步版本信息](#syncv---同步版本信息)
  - [通用选项](#通用选项)
    - [环境选项](#环境选项)
    - [调试模式](#调试模式)
  - [配置文件说明](#配置文件说明)
    - [freelog.resource.config.js](#freelogresourceconfigjs)
    - [freelog.version.config.js](#freelogversionconfigjs)
  - [常见问题](#常见问题)
    - [1. 如何查看当前登录状态？](#1-如何查看当前登录状态)
    - [2. 如何切换测试环境和生产环境？](#2-如何切换测试环境和生产环境)
    - [3. 创建资源失败怎么办？](#3-创建资源失败怎么办)
    - [4. 工作空间登录和全局登录的区别？](#4-工作空间登录和全局登录的区别)
    - [5. 如何查看命令帮助？](#5-如何查看命令帮助)
  - [命令流程图](#命令流程图)
    - [创建资源的流程](#创建资源的流程)
    - [同步信息的流程](#同步信息的流程)
  - [注意事项](#注意事项)
  - [更多帮助](#更多帮助)

---

## 认证命令

### login - 用户登录

登录到 Freelog 平台，支持全局登录和工作空间登录。

**语法：**
```bash
freelog-cli login [选项]
```

**选项：**
- `-g, --global` - 全局登录（认证信息保存在用户主目录）
- `-u, --username <username>` - 用户名或邮箱（可选，不提供则交互式输入）
- `-p, --password <password>` - 密码（可选，不提供则交互式输入）

**示例：**
```bash
# 交互式登录（工作空间登录）
freelog-cli login

# 全局登录
freelog-cli login --global

# 使用命令行参数登录
freelog-cli login -u myusername -p mypassword

# 全局登录并指定用户名
freelog-cli login --global -u myusername
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

**说明：**
- 退出登录会清除本地保存的认证信息
- 如果指定 `--global`，则清除全局登录信息；否则清除工作空间登录信息

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
- `--debug` - 调试模式，显示详细错误信息

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

# 初始化其余资源类型（在当前目录创建配置文件）
freelog-cli init
# 然后选择"其余资源"
```

**说明：**
- 对于**主题、插件、前端库**：会创建项目目录并下载模板，包含完整的项目结构
- 对于**其余资源**：在当前目录创建配置文件，需要先登录以选择资源类型
- 项目名称只能包含英文字母、数字、下划线和横杠
- 如果目录已存在，会提示是否覆盖

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
- `--debug` - 调试模式，显示详细错误信息和请求数据

**示例：**
```bash
# 使用配置文件中的信息创建资源
freelog-cli create

# 指定资源名称创建
freelog-cli create my-resource-name

# 使用指定的配置文件
freelog-cli create -c ./custom-config.js

# 调试模式（显示请求信息）
freelog-cli create --debug
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

**配置文件示例：**
```javascript
const config = {
  resourceId: "",
  resourceName: "我的资源",
  resourceType: ["主题"],
  resourceTypeCode: "RT001",
  intro: "资源介绍",
  coverImages: [],
  tags: [],
  status: 0,
  policies: []
};
```

---

### publish - 发布版本

发布资源版本到 Freelog 平台。

**语法：**
```bash
freelog-cli publish [选项]
```

**选项：**
- `-d, --draft` - 发布为草稿（暂未实现）
- `-c, --config <path>` - 指定配置文件路径
- `-m, --message <message>` - 版本更新说明

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
- 对于**主题、插件、软件库**类型，会自动压缩 `filePath` 指定的目录为 ZIP 文件
- 对于其他类型，直接上传 `filePath` 指定的文件
- 会自动计算文件的 SHA1 值，如果服务器已存在相同 SHA1 的文件，则不会重复上传
- 发布成功后会更新本地配置文件

**配置文件要求：**
- `freelog.version.config.js` 中需要配置：
  - `version` - 版本号（如：`1.0.0`）
  - `filePath` - 文件路径或目录路径（可选，如：`dist`）
    - 对于**主题、插件、软件库**：应为目录路径，会自动压缩为 ZIP
    - 对于**其他类型**：可以为空或目录路径，会与 `filename` 组合
  - `filename` - 文件名（必填，对于不需要压缩的资源类型）
    - 如果 `filePath` 为空，文件会在当前执行命令的目录中查找
    - 如果 `filePath` 不为空，文件路径为 `filePath + filename`
  - `description` - 版本描述（可选，如果为空会提示输入）
  - `resourceId` - 资源ID（如果为空，会从 `resource.config` 获取或提示输入）
  - `resourceName` - 资源名称（如果为空，会从 `resource.config` 获取或提示输入）
  - `resourceType` - 资源类型（如果为空，会从 `resource.config` 获取或提示输入）

**文件处理：**
- **主题、插件、软件库**：
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

## 通用选项

### 环境选项

- `-t, --test` - 使用测试环境（需要在命令前添加）

**示例：**
```bash
# 使用测试环境登录
freelog-cli -t login

# 使用测试环境创建资源
freelog-cli -t create
```

### 调试模式

- `--debug` - 显示详细的错误信息和调试信息

**示例：**
```bash
# 调试模式创建资源（会显示请求数据）
freelog-cli create --debug
```

---

## 配置文件说明

### freelog.resource.config.js

资源配置文件，包含资源的基本信息。

**主要字段：**
- `resourceId` - 资源ID（创建资源后自动填充）
- `resourceName` - 资源名称（必填）
- `resourceType` - 资源类型数组（必填，如：`['主题']`）
- `resourceTypeCode` - 资源类型代码（必填，如：`RT001`）
- `resourceTitle` - 资源标题（可选）
- `intro` - 资源介绍（可选）
- `coverImages` - 封面图URL列表（可选，最多10张）
- `tags` - 标签列表（可选，最多20个）
- `status` - 资源状态（0:待发行 1:上架 2:冻结 4:下架）
- `policies` - 策略信息（可选）

### freelog.version.config.js

版本配置文件，包含版本相关的信息。

**主要字段：**
- `version` - 版本号（必填，如：`1.0.0`）
- `filePath` - 文件路径或目录路径（必填，如：`dist`）
- `filename` - 文件名（可选，发布时自动生成）
- `fileSha1` - 文件SHA1值（发布后自动填充）
- `description` - 版本描述（可选）
- `dependencies` - 依赖列表（可选）
- `baseUpcastResources` - 上抛资源列表（可选）
- `resourceId` - 资源ID（可选，会从 resource.config 获取）
- `resourceName` - 资源名称（可选，会从 resource.config 获取）
- `resourceType` - 资源类型（可选，会从 resource.config 获取）

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
```

---

## 命令流程图

### 创建资源的流程

```
1. 登录 (login)
   ↓
2. 初始化项目 (init)
   ↓
3. 配置资源信息 (编辑 freelog.resource.config.js)
   ↓
4. 创建资源 (create)
   ↓
5. 配置版本信息 (编辑 freelog.version.config.js)
   ↓
6. 发布版本 (publish)
```

### 同步信息的流程

```
1. 登录 (login)
   ↓
2. 同步资源信息 (syncr)
   ↓
3. 同步版本信息 (syncv)
```

---

## 注意事项

1. **登录状态**：大部分命令需要先登录，执行前会显示当前登录用户信息并要求确认
2. **配置文件**：确保配置文件格式正确，字段类型匹配
3. **文件路径**：`filePath` 可以是相对路径或绝对路径，确保文件或目录存在
4. **资源类型**：`resourceType` 必须是数组格式，如：`['主题']`
5. **版本号**：遵循语义化版本规范（如：`1.0.0`）
6. **文件大小**：上传的文件大小有限制，请参考 Freelog 平台文档

---

## 更多帮助

如有问题，请查看：
- [Freelog 官方文档](https://doc.freelog.com/)
- [GitHub Issues](https://github.com/freelog/freelog-runtime-cli/issues)

