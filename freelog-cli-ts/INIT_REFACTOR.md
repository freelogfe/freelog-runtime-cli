# Init 命令重构 - 文件拆分

## 概述

将原来单一的 `init.ts` 拆分为三个文件，按照初始化类型和职责进行分离：

1. **`init.ts`** - 主入口，负责类型选择和路由
2. **`initTemplate.ts`** - 处理主题/插件/前端库的模板初始化
3. **`initResource.ts`** - 处理其余资源的简单初始化

## 文件结构

```
src/commands/
├── init.ts              # 主入口（类型选择和路由）
├── initTemplate.ts      # 模板初始化（主题/插件/前端库）
└── initResource.ts      # 资源初始化（其余资源）
```

## 文件职责

### 1. `init.ts` - 主入口

**职责：**
- 显示欢迎信息
- 检查目录状态（是否为空、是否需要清空）
- 验证用户登录状态
- 获取初始化类型（主题/插件/前端库/其余资源）
- 根据类型路由到不同的初始化逻辑

**核心函数：**
```typescript
export async function executeInit(name?: string, options: CommandOptions): Promise<void>
```

**流程：**
```
开始
 ↓
检查目录状态
 ↓
验证登录
 ↓
选择初始化类型
 ↓
┌─────────┬─────────────────────┐
│ 类型    │ 路由                 │
├─────────┼─────────────────────┤
│ 主题    │ → executeInitTemplate│
│ 插件    │ → executeInitTemplate│
│ 前端库  │ → executeInitTemplate│
│ 其余资源│ → executeInitResource│
└─────────┴─────────────────────┘
```

### 2. `initTemplate.ts` - 模板初始化

**职责：**
- 处理主题、插件、前端库的初始化
- 获取项目信息（名称、版本、命名空间等）
- 调用 Freelog API 创建资源
- 生成 TypeScript/JavaScript 配置文件
- 创建基本目录结构（`src/`, `dist/`）
- 生成 README.md
- （TODO）下载和安装模板

**资源类型映射：**
```typescript
export const RESOURCE_TYPE_MAP: Record<string, string[]> = {
  theme: ['主题'],
  widget: ['插件'],
  package: ['前端库'],
};
```

**核心函数：**
```typescript
export async function executeInitTemplate(initType: string): Promise<void>
```

**流程：**
```
开始
 ↓
获取项目名称（自动格式化）
 ↓
获取版本号
 ↓
[前端库] 获取命名空间
 ↓
调用 API 创建资源
 ↓
创建目录结构（src/, dist/）
 ↓
生成配置文件（.ts 或 .js）
 ↓
生成 README.md
 ↓
完成
```

**配置文件格式选择：**
- 项目名称包含 'ts' → `freelog.config.ts`
- 其他 → `freelog.config.js`

### 3. `initResource.ts` - 资源初始化

**职责：**
- 处理其余资源类型的初始化
- 获取资源名称（可选）
- **仅创建本地配置文件**，不调用 API
- 生成 JSON 配置文件
- 生成 README.md

**核心函数：**
```typescript
export async function executeInitResource(projectName: string): Promise<void>
```

**流程：**
```
开始
 ↓
格式化项目名称
 ↓
获取资源名称（可选）
 ↓
生成 JSON 配置文件（空的 resourceId）
 ↓
生成 README.md
 ↓
完成
```

**配置文件：**
- 固定使用 `freelog.config.json`
- 不包含 resourceId（需要用户在平台创建资源后手动填写）

**注意：**
- ⚠️ **不需要登录** - 因为不调用 API
- ⚠️ **不自动创建资源** - 用户需要手动在 Freelog 平台创建资源
- 💡 提示用户在配置文件中填写资源信息

## 主要差异对比

| 特性 | 模板初始化 (initTemplate) | 资源初始化 (initResource) |
|------|-------------------------|-------------------------|
| **适用类型** | 主题、插件、前端库 | 其余资源 |
| **需要登录** | ✅ 是（调用 API 创建资源） | ❌ 否（仅创建本地文件） |
| **调用 API** | ✅ 创建 Freelog 资源 | ❌ 不调用 |
| **配置文件** | `freelog.config.ts` 或 `.js` | `freelog.config.json` |
| **resourceId** | ✅ 自动填写（API 返回） | ❌ 空值（需用户手动填写） |
| **格式判断** | 根据项目名称是否包含 'ts' | 固定 JSON |
| **目录结构** | 创建 `src/`, `dist/` | 无 |
| **额外信息** | 前端库需要命名空间 | 仅资源名称（可选） |
| **模板下载** | 有（TODO 未实现） | 无 |

## 导出和导入关系

### `initTemplate.ts` 导出：
```typescript
export const TYPE_THEME = 'theme';
export const TYPE_WIDGET = 'widget';
export const TYPE_PACKAGE = 'package';
export const RESOURCE_TYPE_MAP: Record<string, string[]>;
export async function executeInitTemplate(initType: string): Promise<void>;
```

### `initResource.ts` 导出：
```typescript
export async function executeInitResource(projectName: string): Promise<void>;
```

### `init.ts` 导入：
```typescript
import { requireAuth } from '../core/auth';
import { executeInitTemplate, TYPE_THEME, TYPE_WIDGET, TYPE_PACKAGE } from './initTemplate';
import { executeInitResource } from './initResource';
```

## 使用示例

### 场景 1：创建主题项目

```bash
$ freelog-cli init
? 请选择初始化类型 主题
? 请输入主题名称 my-theme
? 请输入版本号 1.0.0
✔ Freelog 资源创建成功: 60a1234567890abcdef12345
⚠️  注意: 模板下载功能尚未实现，仅创建基本配置文件
✔ 项目初始化成功
ℹ 配置文件: freelog.config.js
ℹ 资源 ID: 60a1234567890abcdef12345
```

### 场景 2：创建前端库项目

```bash
$ freelog-cli init my-library-ts
? 请选择初始化类型 前端库
? 请输入前端库名称 my-library-ts
? 请输入版本号 1.0.0
? 请输入库的 nameSpace myLib
✔ Freelog 资源创建成功: 60a1234567890abcdef12346
✔ 项目初始化成功
ℹ 配置文件: freelog.config.ts
ℹ 资源 ID: 60a1234567890abcdef12346
```

### 场景 3：创建其他资源

```bash
$ freelog-cli init my-resource
? 请选择初始化类型 其余资源
? 请输入项目名称 my-resource
? 请输入资源名称（可选，稍后可在配置文件中修改） My Resource
✔ 配置文件创建成功
ℹ 配置文件: freelog.config.json

ℹ 下一步:
  1. 在 Freelog 平台创建资源，获取 resourceId
  2. 在 freelog.config.json 中填写资源信息
  3. 执行 freelog-cli publish 发布资源
```

**注意：** 其余资源类型不会自动创建 Freelog 资源，需要用户手动在平台创建并填写 resourceId。

## 代码复用

### 重复函数已提取

以下函数在多个文件中重复，可考虑进一步提取到 `utils/init.ts`：

1. **`formatName()`** - 格式化项目名称
   - 出现在：`initTemplate.ts`, `initResource.ts`

2. **`generateReadme()`** - 生成 README.md
   - 出现在：`initTemplate.ts`, `initResource.ts`（逻辑略有不同）

**注意：** 
- `getProjectVersion()` 和 `createFreelogResource()` 仅在 `initTemplate.ts` 中使用
- `initResource.ts` 不再调用这些函数（简化为仅创建本地配置）

### 建议进一步优化（可选）

创建 `utils/initHelpers.ts`：

```typescript
// src/utils/initHelpers.ts
export function formatName(name: string): string { /* ... */ }
export async function generateReadme(projectName: string, options: ReadmeOptions): Promise<void> { /* ... */ }
```

然后在 `initTemplate.ts` 和 `initResource.ts` 中导入使用。

**注意：** 由于两个文件的职责差异较大，当前的轻微代码重复是可接受的，过度抽象可能降低可读性。

## 待实现功能

1. **模板下载** (initTemplate.ts)
   - 参考 `packages/init/lib/index.js` 中的逻辑
   - 实现 `downloadTemplate()` 函数
   - 实现 `installTemplate()` 函数
   - 支持 EJS 模板渲染
   - 自动安装依赖（`npm install`）

2. **自定义模板支持**
   - 支持 `TEMPLATE_TYPE_CUSTOM`

3. **代码复用优化**
   - 提取公共函数到 `utils/initHelpers.ts`

## 优势

1. ✅ **职责清晰** - 每个文件专注于一种初始化逻辑
2. ✅ **易于维护** - 修改模板逻辑不影响资源逻辑
3. ✅ **易于扩展** - 可独立添加新的初始化类型
4. ✅ **代码可读性** - 文件更短，逻辑更清晰
5. ✅ **便于测试** - 可以独立测试每个初始化逻辑

## 总结

通过文件拆分，`init` 命令的结构更加清晰和模块化：

- **入口层** (`init.ts`) 负责路由
- **业务层** (`initTemplate.ts`, `initResource.ts`) 负责具体逻辑
- **API 层** (`api/create.ts`) 负责与 Freelog 平台交互

这种架构使得未来添加新的初始化类型或修改现有逻辑都更加容易和安全。

