# 📋 Freelog CLI 测试流程文档

## 🎯 测试目标

逐个测试所有命令，确保配置文件拆分后的功能正常工作。

---

## 📦 准备工作

### 1. 安装依赖
```bash
cd freelog-cli-ts
pnpm install --ignore-workspace
```

### 2. 编译项目
```bash
pnpm run build
```

### 3. 链接到全局（方便测试）
```bash
pnpm link --global
```

### 4. 检查命令是否可用
```bash
freelog-cli --version
freelog-cli --help
```

### 5. 准备测试目录
```bash
# 创建测试目录
mkdir D:\test-freelog-cli
cd D:\test-freelog-cli
```

---

## 🧪 测试流程

### 测试 1: 登录命令

#### 测试目标
确保用户能够登录并保存认证信息。

#### 测试步骤
```bash
# 1. 测试登录
freelog-cli login

# 预期：提示输入用户名和密码，登录成功后保存 token
```

#### 验证要点
- [ ] 能够输入用户名和密码
- [ ] 登录成功后显示成功消息
- [ ] Token 保存到本地配置文件
- [ ] 登录失败时显示错误信息

#### 可能的问题
- 登录接口地址是否正确
- Token 存储路径是否正确
- 错误提示是否友好

---

### 测试 2: init 命令 - 创建主题项目

#### 测试目标
测试创建主题类型项目，验证是否生成双配置文件并调用 API 创建资源。

#### 测试步骤
```bash
# 1. 创建测试目录
mkdir test-theme
cd test-theme

# 2. 初始化主题项目
freelog-cli init my-test-theme

# 预期流程：
# - 选择资源类型：主题
# - 选择配置格式：ts / js / json
# - 调用 API 创建资源
# - 生成 freelog.resource.config.* 和 freelog.version.config.*
```

#### 验证要点
- [ ] 能够选择"主题"类型
- [ ] 能够选择配置文件格式（ts/js/json）
- [ ] API 创建资源成功
- [ ] 生成了 `freelog.resource.config.*` 文件
- [ ] 生成了 `freelog.version.config.*` 文件
- [ ] 资源配置包含 resourceId, resourceName, resourceType
- [ ] 版本配置包含 version, dependencies 等字段
- [ ] 配置格式正确，可以被正常读取

#### 检查配置文件
```bash
# 查看生成的配置文件
cat freelog.resource.config.ts
cat freelog.version.config.ts
```

#### 可能的问题
- API 调用失败
- 配置文件生成格式错误
- resourceId 未正确写入
- 配置文件类型定义错误

---

### 测试 3: init 命令 - 创建其他资源

#### 测试目标
测试"其他资源"类型，只生成配置文件，不调用 API。

#### 测试步骤
```bash
# 1. 创建新测试目录
cd ..
mkdir test-other
cd test-other

# 2. 初始化其他资源
freelog-cli init my-other-resource

# 预期流程：
# - 选择资源类型：其余资源
# - 选择配置格式
# - 仅生成本地配置文件，不调用 API
```

#### 验证要点
- [ ] 能够选择"其余资源"类型
- [ ] 不调用创建资源的 API
- [ ] 生成了双配置文件
- [ ] 配置文件中 resourceId 为空或占位符
- [ ] 配置文件格式正确

#### 可能的问题
- 仍然调用了 API（不应该）
- 配置文件缺失字段
- 格式错误

---

### 测试 4: create 命令

#### 测试目标
使用 `create` 命令创建 Freelog 资源。

#### 测试步骤
```bash
# 在 test-other 目录中
# 1. 确保有 freelog.resource.config.* 文件

# 2. 修改 freelog.resource.config.ts
# 填写资源名称、类型、介绍等

# 3. 执行 create 命令
freelog-cli create

# 预期：
# - 读取 freelog.resource.config.*
# - 调用 API 创建资源
# - 返回 resourceId
# - 更新 freelog.resource.config.* 中的 resourceId
```

#### 验证要点
- [ ] 能够读取资源配置文件
- [ ] API 创建成功
- [ ] resourceId 写入配置文件
- [ ] 错误提示友好（如缺少必填字段）

#### 可能的问题
- 读取配置文件失败
- API 参数不正确
- resourceId 未写回配置
- 缺少字段时未提示

---

### 测试 5: sync 命令 - 同步资源和版本信息

#### 测试目标
从 Freelog 服务器同步资源和版本信息到本地配置。

#### 测试场景 A: 使用配置文件中的 resourceId

```bash
# 在有配置文件的目录中
cd ../test-theme

# 执行同步
freelog-cli sync

# 预期：
# - 读取 freelog.resource.config.* 中的 resourceId
# - 请求资源信息和最新版本信息
# - 更新两个配置文件
```

#### 测试场景 B: 指定 resourceId

```bash
# 创建空目录
cd ..
mkdir test-sync
cd test-sync

# 指定 resourceId 同步
freelog-cli sync <实际的resourceId>

# 预期：
# - 请求指定资源的信息
# - 生成两个配置文件
```

#### 测试场景 C: 同步指定版本

```bash
freelog-cli sync <resourceId> -v 1.0.0

# 预期：
# - 请求资源信息
# - 请求指定版本的版本信息
# - 合并数据并保存
```

#### 测试场景 D: 仅同步资源信息

```bash
freelog-cli sync --resource-only

# 预期：
# - 只更新 freelog.resource.config.*
# - 不更新 freelog.version.config.*
```

#### 测试场景 E: 仅同步版本信息

```bash
freelog-cli sync --version-only

# 预期：
# - 只更新 freelog.version.config.*
# - 不更新 freelog.resource.config.*
```

#### 验证要点
- [ ] 配置文件中有 resourceId 时能正常同步
- [ ] 指定 resourceId 参数时能正常同步
- [ ] 指定版本号时能同步特定版本
- [ ] --resource-only 只更新资源配置
- [ ] --version-only 只更新版本配置
- [ ] 资源不存在时有友好提示
- [ ] 版本不存在时有友好提示

#### 可能的问题
- 参数解析错误
- API 请求失败
- 数据合并逻辑错误
- 配置文件保存失败
- 选项逻辑错误

---

### 测试 6: dep add 命令

#### 测试目标
添加依赖到版本配置文件。

#### 测试步骤
```bash
# 在有配置文件的目录
cd ../test-theme

# 1. 添加依赖（基本模式）
freelog-cli dep add <某个资源ID>

# 预期流程：
# - 请求资源信息
# - 显示资源的策略列表
# - 选择策略
# - 选择是否签约（上抛/签约）
# - 如果签约：创建合同
# - 如果有上抛资源：检查授权状态，决定是否需要支付
# - 添加到 freelog.version.config.* 的 dependencies 数组
```

#### 验证要点
- [ ] 能够输入资源 ID
- [ ] 显示资源信息（名称、类型、版本）
- [ ] 显示策略列表
- [ ] 能够选择策略
- [ ] 能够选择上抛或签约
- [ ] 签约时创建合同
- [ ] 检查上抛资源的授权状态
- [ ] 已授权时不需要支付
- [ ] 未授权时提示支付
- [ ] 依赖添加到 freelog.version.config.*
- [ ] 依赖包含 resourceId, resourceName, versionRange
- [ ] 重复添加时覆盖旧的依赖

#### 可能的问题
- 资源不存在时未处理
- 策略列表为空时崩溃
- 签约接口调用失败
- 上抛资源逻辑错误
- 授权检查失败
- 依赖未保存到配置
- versionRange 格式错误

---

### 测试 7: dep list 命令

#### 测试目标
列出当前项目的所有依赖。

#### 测试步骤
```bash
# 1. 列出依赖
freelog-cli dep list

# 预期：
# - 读取 freelog.version.config.*
# - 显示资源 ID 和版本号
# - 显示依赖列表（resourceName, versionRange）
```

#### 测试带树形结构

```bash
# 2. 显示依赖树
freelog-cli dep list --tree

# 预期：
# - 递归显示依赖关系
# - 树形结构清晰
```

#### 验证要点
- [ ] 能够读取版本配置
- [ ] 显示当前资源 ID 和版本
- [ ] 显示所有依赖
- [ ] 依赖信息完整（名称、版本范围）
- [ ] 无依赖时提示友好
- [ ] --tree 选项显示树形结构

#### 可能的问题
- 读取配置失败
- dependencies 为空时崩溃
- 显示格式混乱
- 树形结构逻辑错误

---

### 测试 8: dep update 命令

#### 测试目标
更新依赖的版本范围。

#### 测试步骤
```bash
# 1. 更新依赖版本
freelog-cli dep update <resourceId>

# 预期流程：
# - 请求该资源的版本列表
# - 显示当前版本范围
# - 显示可用版本列表
# - 选择新版本
# - 更新 freelog.version.config.* 中的 versionRange
```

#### 验证要点
- [ ] 能够找到指定依赖
- [ ] 显示当前版本范围
- [ ] 显示可用版本列表
- [ ] 能够选择新版本
- [ ] 版本范围更新成功
- [ ] 依赖不存在时有提示

#### 可能的问题
- 依赖未找到时崩溃
- 版本列表请求失败
- 版本范围更新失败
- 配置保存失败

---

### 测试 9: dep remove 命令

#### 测试目标
移除指定依赖。

#### 测试步骤
```bash
# 1. 移除依赖
freelog-cli dep remove <resourceId>

# 预期：
# - 找到并移除依赖
# - 更新 freelog.version.config.*
# - 显示剩余依赖列表
```

#### 验证要点
- [ ] 能够移除指定依赖
- [ ] 配置文件更新正确
- [ ] 显示剩余依赖
- [ ] 依赖不存在时有提示
- [ ] 移除后再次列出依赖，确认已移除

#### 可能的问题
- 依赖未找到时崩溃
- 移除后配置格式错误
- 显示信息不正确

---

### 测试 10: dep sync 命令

#### 测试目标
同步所有依赖到最新版本。

#### 测试场景 A: 检查更新模式

```bash
# 1. 检查更新（不修改）
freelog-cli dep sync

# 选择：检查更新（仅查看，不修改）

# 预期：
# - 读取所有依赖
# - 请求每个依赖的最新版本
# - 显示当前版本和最新版本对比
# - 显示授权状态
# - 不修改配置文件
```

#### 测试场景 B: 同步到最新版本

```bash
# 2. 同步到最新版本
freelog-cli dep sync

# 选择：同步到最新版本

# 预期：
# - 显示更新列表
# - 确认是否更新
# - 更新所有依赖的 versionRange
# - 保存配置
```

#### 测试场景 C: 交互式选择

```bash
# 3. 交互式选择版本
freelog-cli dep sync

# 选择：交互式选择版本

# 预期：
# - 显示可更新的依赖列表
# - 多选要更新的依赖
# - 更新选中的依赖
```

#### 测试场景 D: 直接同步最新

```bash
# 4. 命令行参数直接同步
freelog-cli dep sync latest

# 预期：
# - 直接进入"同步到最新版本"模式
```

#### 验证要点
- [ ] 能够检查所有依赖的更新
- [ ] 显示授权状态
- [ ] 显示版本对比信息
- [ ] 检查模式不修改配置
- [ ] 同步模式正确更新配置
- [ ] 交互式选择功能正常
- [ ] 批量更新依赖成功
- [ ] 无更新时有提示

#### 可能的问题
- 请求多个资源时性能问题
- 授权检查失败
- 批量更新逻辑错误
- 配置保存失败
- 交互界面混乱

---

### 测试 11: update 命令

#### 测试目标
更新资源信息（intro、coverImages）。

#### 测试步骤
```bash
# 1. 更新资源介绍
freelog-cli update --intro "这是一个测试主题"

# 2. 更新封面图片
freelog-cli update --cover "https://example.com/cover1.jpg,https://example.com/cover2.jpg"

# 3. 同时更新多个字段
freelog-cli update --intro "新介绍" --cover "url1,url2"

# 预期：
# - 读取 freelog.resource.config.*
# - 调用更新资源 API
# - 更新本地配置文件
```

#### 验证要点
- [ ] 能够读取资源配置
- [ ] API 调用成功
- [ ] 本地配置文件更新
- [ ] 缺少 resourceId 时有提示
- [ ] 未登录时有提示
- [ ] 错误时有友好提示

#### 可能的问题
- 读取配置失败
- API 参数格式错误
- 配置更新失败
- 封面图片格式处理错误

---

### 测试 12: publish 命令

#### 测试目标
发布新版本。

#### 测试准备
```bash
# 1. 确保有测试文件
cd ../test-theme
mkdir -p build
echo "test content" > build/index.html

# 2. 确保配置文件正确
# 检查 freelog.version.config.* 中的：
# - buildPath 或 fileTarget
# - version
# - dependencies
```

#### 测试场景 A: 发布压缩目录

```bash
# 配置中设置：
# buildPath: './build'
# resourceType: ['主题']

# 执行发布
freelog-cli publish

# 预期流程：
# 1. 读取双配置文件
# 2. 压缩 buildPath 目录为 .zip
# 3. 计算 SHA1
# 4. 检查文件是否已存在
# 5. 如果存在，查询使用该文件的资源列表，询问是否继续
# 6. 上传文件到 OSS
# 7. 创建资源版本
# 8. 更新 freelog.version.config.* 的 fileSha1 和 filename
```

#### 测试场景 B: 发布指定文件

```bash
# 配置中设置：
# fileTarget: './package.zip'

# 执行发布
freelog-cli publish

# 预期：
# - 直接使用 fileTarget 文件
# - 不进行压缩
# - 其他流程相同
```

#### 测试场景 C: SHA1 已存在的情况

```bash
# 1. 第一次发布
freelog-cli publish

# 2. 不修改文件，再次发布
freelog-cli publish

# 预期：
# - 检测到 SHA1 已存在
# - 显示使用该文件的资源列表
# - 询问是否继续
# - 选择继续则跳过上传，直接创建版本
```

#### 验证要点
- [ ] 能够读取双配置文件
- [ ] buildPath 目录压缩成功
- [ ] fileTarget 文件直接使用
- [ ] SHA1 计算正确
- [ ] 文件存在性检查正常
- [ ] 资源列表显示正确
- [ ] 用户确认流程正常
- [ ] 文件上传成功
- [ ] 创建版本成功
- [ ] fileSha1 和 filename 写回配置
- [ ] 错误处理友好

#### 可能的问题
- 压缩失败
- SHA1 计算不一致
- 文件上传失败
- API 调用失败
- 配置更新失败
- buildPath 或 fileTarget 不存在时未处理
- 资源类型判断错误

---

## 🐛 问题记录表

在测试过程中，记录发现的问题：

| # | 命令 | 问题描述 | 严重程度 | 状态 |
|---|------|----------|----------|------|
| 1 |      |          | 🔴高/🟡中/🟢低 | ⏳待修复/✅已修复 |
| 2 |      |          |          |      |
| 3 |      |          |          |      |

---

## ✅ 测试检查清单

### 基础功能
- [ ] 登录功能正常
- [ ] 配置文件读写正常
- [ ] 错误提示友好

### 初始化命令
- [ ] init - 主题项目
- [ ] init - 插件项目
- [ ] init - 前端库项目
- [ ] init - 其他资源
- [ ] 双配置文件生成正确

### 资源管理
- [ ] create - 创建资源
- [ ] update - 更新资源信息
- [ ] sync - 同步资源和版本信息
- [ ] sync - 支持各种参数组合

### 版本发布
- [ ] publish - 压缩目录发布
- [ ] publish - 指定文件发布
- [ ] publish - SHA1 检查
- [ ] publish - 资源列表查询

### 依赖管理
- [ ] dep add - 添加依赖（基本流程）
- [ ] dep add - 签约和支付
- [ ] dep add - 上抛资源处理
- [ ] dep list - 列表显示
- [ ] dep list - 树形显示
- [ ] dep update - 更新版本
- [ ] dep remove - 移除依赖
- [ ] dep sync - 检查更新
- [ ] dep sync - 同步最新
- [ ] dep sync - 交互选择

### 边界情况
- [ ] 未登录时的错误提示
- [ ] 配置文件不存在时的处理
- [ ] 网络请求失败时的重试
- [ ] 资源不存在时的提示
- [ ] 权限不足时的提示

---

## 📝 测试建议

### 测试顺序
1. **先测试基础命令**：login → init → sync
2. **再测试资源管理**：create → update
3. **然后测试依赖**：dep add → dep list → dep update → dep remove → dep sync
4. **最后测试发布**：publish

### 测试技巧
1. **准备真实数据**：使用真实的 resourceId 和版本号测试
2. **边界测试**：故意输入错误数据，检查错误处理
3. **清理测试数据**：每次测试后清理临时文件
4. **记录日志**：保存命令输出，方便调试

### 常见问题排查
1. **命令找不到**：检查 `pnpm link --global` 是否成功
2. **API 调用失败**：检查网络和 token 是否有效
3. **配置文件错误**：检查格式和必填字段
4. **文件路径错误**：检查相对路径和绝对路径
5. **pnpm link 问题**：如果全局链接失败，可以使用 `node dist/index.js` 直接运行

---

## 🔧 调试技巧

### 查看详细日志
```bash
# 如果支持 --verbose 参数
freelog-cli <command> --verbose
```

### 检查配置文件
```bash
# 查看配置文件内容
cat freelog.resource.config.ts
cat freelog.version.config.ts
```

### 手动测试 API
使用 Postman 或 curl 手动测试 Freelog API，确认接口是否正常。

### 断点调试
在代码中添加 `debugger` 或 `console.log`，使用 VSCode 调试。

---

## 📞 需要帮助时

如果在测试过程中遇到问题：

1. **记录错误信息**：完整的错误堆栈和命令输出
2. **描述操作步骤**：详细说明如何复现问题
3. **提供配置文件**：相关的配置文件内容
4. **说明预期行为**：你期望的正确结果是什么

---

祝测试顺利！🎉

发现问题随时告诉我，我会帮你修复！

