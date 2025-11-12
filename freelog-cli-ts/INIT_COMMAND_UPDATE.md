# Init 命令重构说明

## 更新概述

完全重构了 `init` 命令，参考 `packages/init/lib/index.js` 的逻辑，支持 4 种资源类型的初始化：

1. **主题** (theme)
2. **插件** (widget)
3. **前端库** (package)
4. **其余资源** (other)

## 主要变更

### 1. API 层

#### 新文件：`src/api/create.ts`

资源创建和更新相关 API：

- `createResource()` - 创建资源
- `updateResource()` - 更新资源信息
- `batchCreateResources()` - 批量创建资源
- `batchUpdateResources()` - 批量更新资源信息

对应接口文档：
- https://doc.freelog.com/resourceV2/创建资源.html
- https://doc.freelog.com/resourceV2/更新资源信息.html
- https://doc.freelog.com/resourceV2/批量创建资源.html
- https://doc.freelog.com/resourceV2/批量更新资源信息.html

#### 保留文件：`src/api/update.ts`

资源版本更新相关 API（保持不变）：

- `createResourceVersion()` - 创建资源版本
- `saveResourceVersionDraft()` - 保存资源版本草稿

### 2. Init 命令 (`src/commands/init.ts`)

完全重写，新增功能：

#### 交互流程

1. **检查目录状态**
   - 如果目录非空，询问是否继续
   - 支持 `--force` 选项强制清空目录

2. **选择初始化类型**
   - 主题 (theme) → 资源类型: `['主题']`
   - 插件 (widget) → 资源类型: `['插件']`
   - 前端库 (package) → 资源类型: `['前端库']`
   - 其余资源 (other) → 资源类型由用户输入

3. **输入项目信息**
   - 项目名称（自动格式化为小写、移除特殊字符）
   - 版本号（默认 1.0.0）
   - 前端库额外需要：命名空间（自动添加 `freelogLibrary.` 前缀）
   - 其余资源额外需要：资源类型列表（逗号分隔）

4. **创建 Freelog 资源**
   - 调用 `createResource` API 在 Freelog 平台创建资源
   - 获取资源 ID

5. **生成项目文件**

   **主题/插件/前端库：**
   - 创建 `freelog.config.ts` 或 `freelog.config.js`（根据项目名称判断）
   - 创建基本目录结构（`src/`, `dist/`）
   - 创建 `README.md`
   - 注意：模板下载功能暂未实现

   **其余资源：**
   - 创建 `freelog.config.json`
   - 创建 `README.md`

#### 命令选项

```bash
freelog-cli init [name]

选项:
  -f, --force  强制清空目录
  --debug      调试模式
```

### 3. 命令定义 (`src/index.ts`)

更新了 `init` 命令的描述和选项：

```typescript
program
  .command('init [name]')
  .description('初始化项目（支持主题、插件、前端库和其余资源）')
  .option('-f, --force', '强制清空目录')
  .option('--debug', '调试模式')
  .action(executeInit);
```

## 使用示例

### 创建主题项目

```bash
freelog-cli init my-theme
# 选择: 主题
# 输入: 项目名称、版本号等
# 结果: 创建 freelog.config.js，资源类型为 ['主题']
```

### 创建前端库项目

```bash
freelog-cli init my-library-ts
# 选择: 前端库
# 输入: 项目名称、版本号、命名空间等
# 结果: 创建 freelog.config.ts，资源类型为 ['前端库']
```

### 创建其他资源

```bash
freelog-cli init my-resource
# 选择: 其余资源
# 输入: 项目名称、版本号、资源类型（如：图片,视频）
# 结果: 创建 freelog.config.json，资源类型为 ['图片', '视频']
```

### 强制清空目录

```bash
freelog-cli init my-project --force
# 如果目录非空，会询问是否清空
```

## 配置文件格式选择

| 资源类型 | 配置文件 | 判断逻辑 |
|---------|---------|---------|
| 主题/插件/前端库 | `freelog.config.ts` 或 `.js` | 项目名称包含 'ts' → TypeScript，否则 → JavaScript |
| 其余资源 | `freelog.config.json` | 固定为 JSON |

## 待实现功能

1. **模板下载** (TODO)
   - 参考 `index.js` 中的 `downloadTemplate()` 和 `installTemplate()`
   - 需要实现从 npm 下载对应的主题/插件/前端库模板
   - 需要 EJS 模板渲染
   - 需要自动安装依赖（`npm install`）

2. **自定义模板支持** (TODO)
   - 支持自定义模板类型（`TEMPLATE_TYPE_CUSTOM`）

## 注意事项

1. **必须先登录**
   - `init` 命令会创建 Freelog 资源，必须先执行 `freelog-cli login`

2. **资源名称格式化**
   - 自动转换为小写
   - 移除特殊字符，替换为 `-`

3. **前端库命名空间**
   - 自动添加 `freelogLibrary.` 前缀（如果未包含）

4. **其余资源的 JSON 配置**
   - 使用 JSON 格式便于其他工具解析
   - 包含 `$schema` 引用便于 IDE 提示

## 与旧版本的兼容性

- 完全重写，不兼容旧的 `init` 命令
- 旧的直接输入 resourceId 的方式已移除
- 新版本自动创建 Freelog 资源，无需手动输入 resourceId

